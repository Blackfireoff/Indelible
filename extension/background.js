// Background Service Worker for Chrome Extension
// Handles communication between popup, content scripts, and dapp connections

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WALLET_CONNECTED') {
    // Store the connected dapp
    storeConnectedDapp(message.origin, message.account);
  } else if (message.type === 'GET_WALLET_STATE') {
    // Return current wallet state
    chrome.storage.local.get(['walletState'], (result) => {
      sendResponse(result.walletState || null);
    });
    return true; // Will respond asynchronously
  }
});

// Store connected dapp info
async function storeConnectedDapp(origin, account) {
  const stored = await chrome.storage.local.get(['connectedDapps']);
  let dapps = stored.connectedDapps || [];

  // Parse hostname for dapp name
  let hostname;
  try {
    const url = new URL(origin);
    hostname = url.hostname.replace('www.', '');
    const parts = hostname.split('.');
    const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
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

// Listen for tab updates to detect dapp connections
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      // Store the origin for potential wallet connections
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        // Content script will handle the actual detection
      }
    } catch (e) {
      // Not a valid URL
    }
  }
});
