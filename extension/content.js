// Content Script - Bridges wallet state between main site and extension

const WALLET_STORAGE_KEY = 'indelible_wallet_state';

// Listen for wallet state changes from the main site
window.addEventListener('wallet-state-changed', function(event) {
  const state = event.detail;
  if (state && state.account) {
    // Forward to extension storage
    chrome.storage.local.set({
      walletState: {
        account: state.account,
        chainId: state.chainId
      }
    });

    // Notify popup if it's open
    chrome.runtime.sendMessage({
      type: 'WALLET_STATE_UPDATE',
      account: state.account,
      chainId: state.chainId
    }).catch(() => {
      // Popup might not be open, that's fine
    });
  } else {
    // Wallet disconnected
    chrome.storage.local.remove(['walletState']);
    chrome.runtime.sendMessage({
      type: 'WALLET_STATE_UPDATE',
      account: null,
      chainId: null
    }).catch(() => {});
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_WALLET_STATE') {
    // Read from localStorage (content script has access to page's localStorage)
    const stored = localStorage.getItem(WALLET_STORAGE_KEY);
    if (stored) {
      try {
        const state = JSON.parse(stored);
        sendResponse({ account: state.account, chainId: state.chainId });
      } catch (e) {
        sendResponse(null);
      }
    } else {
      sendResponse(null);
    }
    return true;
  }

  if (message.type === 'DISCONNECT_WALLET') {
    // Clear wallet state from localStorage
    localStorage.removeItem(WALLET_STORAGE_KEY);
    // Dispatch event to notify the page
    window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: null }));
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TRACK_DAPP') {
    // Track a connected dapp
    trackConnectedDapp(message.origin);
    sendResponse({ success: true });
    return true;
  }
});

async function trackConnectedDapp(origin) {
  const stored = await chrome.storage.local.get(['connectedDapps']);
  let dapps = stored.connectedDapps || [];

  // Parse hostname for name
  let hostname;
  try {
    const url = new URL(origin);
    hostname = url.hostname.replace('www.', '');
    const parts = hostname.split('.');
    const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    hostname = name;
  } catch (e) {
    hostname = origin;
  }

  // Check if already exists
  const exists = dapps.some(function(d) { return d.origin === origin; });
  if (!exists) {
    dapps.push({ origin: origin, name: hostname });
    await chrome.storage.local.set({ connectedDapps: dapps });
  }
}

// Detect when a wallet connects on this page
if (typeof window.ethereum !== 'undefined') {
  let lastAccounts = null;

  // Poll for account changes (EIP-1193)
  setInterval(async function() {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0 && accounts[0] !== lastAccounts) {
        lastAccounts = accounts;
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const state = {
          account: accounts[0],
          chainId: parseInt(chainId, 16)
        };
        localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(state));
        window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: state }));
      } else if ((!accounts || accounts.length === 0) && lastAccounts !== null) {
        lastAccounts = null;
        localStorage.removeItem(WALLET_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: null }));
      }
    } catch (e) {
      // Wallet might not be available
    }
  }, 1000);

  // Also listen for events
  if (window.ethereum.on) {
    window.ethereum.on('accountsChanged', function(accounts) {
      if (accounts && accounts.length > 0) {
        lastAccounts = accounts[0];
        // We don't have chainId here, use existing
        const stored = localStorage.getItem(WALLET_STORAGE_KEY);
        let chainId = 1;
        if (stored) {
          try {
            chainId = JSON.parse(stored).chainId || 1;
          } catch (e) {}
        }
        const state = { account: accounts[0], chainId };
        localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(state));
        window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: state }));
      } else {
        lastAccounts = null;
        localStorage.removeItem(WALLET_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: null }));
      }
    });

    window.ethereum.on('chainChanged', function(chainId) {
      // Reload the state with new chainId
      const stored = localStorage.getItem(WALLET_STORAGE_KEY);
      if (stored) {
        try {
          const state = JSON.parse(stored);
          state.chainId = parseInt(chainId, 16);
          localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(state));
          window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: state }));
        } catch (e) {}
      }
    });
  }
}
