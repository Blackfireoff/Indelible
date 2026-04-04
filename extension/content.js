// Content Script for Dapp Detection
// Detects when a wallet connects to the current dapp and notifies the extension

(function() {
  // Listen for EIP-1193 wallet events
  if (typeof window.ethereum !== 'undefined') {
    // Track accounts
    let lastAccounts = null;

    // Check for account changes
    setInterval(async function() {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0 && accounts !== lastAccounts) {
          lastAccounts = accounts;
          // Notify background script
          chrome.runtime.sendMessage({
            type: 'WALLET_CONNECTED',
            origin: window.location.origin,
            account: accounts[0]
          });
        }
      } catch (e) {
        // Silently fail - wallet might not be available
      }
    }, 2000);

    // Also listen for the accountsChanged event
    window.ethereum.on('accountsChanged', function(accounts) {
      if (accounts && accounts.length > 0) {
        chrome.runtime.sendMessage({
          type: 'WALLET_CONNECTED',
          origin: window.location.origin,
          account: accounts[0]
        });
      }
    });
  }

  // Listen for custom events from AppKit/wagmi
  document.addEventListener('wallet-connected', function(event) {
    chrome.runtime.sendMessage({
      type: 'WALLET_CONNECTED',
      origin: window.location.origin,
      account: event.detail?.address
    });
  });
})();
