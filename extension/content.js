// ══════════════════════════════════════════════════
// Indelible Content Script
// Bridges wallet state + detects text selection
// ══════════════════════════════════════════════════

const WALLET_STORAGE_KEY = 'indelible_wallet_state';

// ═══════════════════════════════
// 1. Wallet State Bridging
// ═══════════════════════════════

// Listen for wallet state changes from the main Indelible site
window.addEventListener('wallet-state-changed', function(event) {
  const state = event.detail;
  if (state && state.account) {
    chrome.storage.local.set({
      walletState: {
        account: state.account,
        chainId: state.chainId,
        indlBalance: state.indlBalance || 0
      }
    });
    chrome.runtime.sendMessage({
      type: 'WALLET_STATE_UPDATE',
      account: state.account,
      chainId: state.chainId,
      indlBalance: state.indlBalance || 0
    }).catch(() => {});
  } else {
    chrome.storage.local.remove(['walletState']);
    chrome.runtime.sendMessage({
      type: 'WALLET_STATE_UPDATE',
      account: null,
      chainId: null,
      indlBalance: 0
    }).catch(() => {});
  }
});

// Handle messages from popup/side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_WALLET_STATE') {
    const stored = localStorage.getItem(WALLET_STORAGE_KEY);
    if (stored) {
      try {
        const state = JSON.parse(stored);
        sendResponse({ account: state.account, chainId: state.chainId, indlBalance: state.indlBalance || 0 });
      } catch (e) {
        sendResponse(null);
      }
    } else {
      sendResponse(null);
    }
    return true;
  }

  if (message.type === 'DISCONNECT_WALLET') {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: null }));
    sendResponse({ success: true });
    return true;
  }
});

// ═══════════════════════════════
// 2. Ethereum Provider Detection
// ═══════════════════════════════

if (typeof window.ethereum !== 'undefined') {
  let lastAccounts = null;

  setInterval(async function() {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0 && accounts[0] !== lastAccounts) {
        lastAccounts = accounts[0];
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
    } catch (e) {}
  }, 2000);

  if (window.ethereum.on) {
    window.ethereum.on('accountsChanged', function(accounts) {
      if (accounts && accounts.length > 0) {
        lastAccounts = accounts[0];
        const stored = localStorage.getItem(WALLET_STORAGE_KEY);
        let chainId = 1;
        if (stored) {
          try { chainId = JSON.parse(stored).chainId || 1; } catch (e) {}
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

// ═══════════════════════════════
// 3. Text Selection + FAB
// ═══════════════════════════════

let fabElement = null;
let hideTimeout = null;

function createFAB() {
  if (fabElement) return fabElement;

  const fab = document.createElement('div');
  fab.id = 'indelible-fab';
  fab.setAttribute('role', 'button');
  fab.setAttribute('tabindex', '0');
  fab.innerHTML = `
    <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
      <circle cx="9" cy="9" r="6" stroke="white" stroke-width="1.5"/>
      <path d="M14 14l4 4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span>Search with Indelible</span>
  `;

  fab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendSelectionToPanel();
    hideFAB();
  });

  fab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sendSelectionToPanel();
      hideFAB();
    }
  });

  document.documentElement.appendChild(fab);
  fabElement = fab;
  return fab;
}

function showFAB(x, y) {
  const fab = createFAB();

  // Position near the selection end
  const vw = window.innerWidth;
  const fabWidth = 200;
  let left = x;
  let top = y + 10;

  // Keep within viewport
  if (left + fabWidth > vw - 16) {
    left = vw - fabWidth - 16;
  }
  if (left < 16) left = 16;

  fab.style.left = left + 'px';
  fab.style.top = (top + window.scrollY) + 'px';
  fab.classList.add('indelible-fab-visible');

  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(hideFAB, 8000);
}

function hideFAB() {
  if (fabElement) {
    fabElement.classList.remove('indelible-fab-visible');
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

function sendSelectionToPanel() {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';
  if (!text) return;

  const source = window.location.hostname + window.location.pathname;

  // Send to side panel via background
  chrome.runtime.sendMessage({
    type: 'TEXT_SELECTED',
    text: text,
    source: source
  }).catch(() => {});

  // Also open the side panel
  chrome.runtime.sendMessage({
    type: 'OPEN_SIDE_PANEL'
  }).catch(() => {});
}

// Listen for text selection
document.addEventListener('mouseup', (e) => {
  // Ignore clicks on our own FAB
  if (e.target && e.target.closest && e.target.closest('#indelible-fab')) return;

  // Small delay to let the selection finalize
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (text && text.length >= 3 && text.length <= 5000) {
      // Get selection coordinates
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showFAB(rect.right, rect.bottom);
    } else {
      hideFAB();
    }
  }, 10);
});

// Hide FAB on scroll or click elsewhere
document.addEventListener('mousedown', (e) => {
  if (e.target && e.target.closest && e.target.closest('#indelible-fab')) return;
  // Don't hide immediately — let mouseup handle new selections
});

document.addEventListener('scroll', () => {
  hideFAB();
}, { passive: true });

// Listen for context menu search requests from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTEXT_MENU_SEARCH') {
    const text = message.text || '';
    if (text) {
      chrome.runtime.sendMessage({
        type: 'TEXT_SELECTED',
        text: text,
        source: window.location.hostname + window.location.pathname
      }).catch(() => {});
    }
  }
});
