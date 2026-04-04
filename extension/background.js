// ══════════════════════════════════════════════════
// Indelible — Background Service Worker
// Side panel toggle, context menu, message relay
// ══════════════════════════════════════════════════

// ── Side Panel Setup ──
// Enable side panel to open on action button click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('sidePanel.setPanelBehavior error:', err));

// ── Context Menu ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'indelible-search',
    title: 'Search with Indelible',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'indelible-search' && info.selectionText) {
    // Open the side panel first
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (e) {
      console.error('Could not open side panel:', e);
    }

    // Small delay to let the panel initialize
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'TEXT_SELECTED',
        text: info.selectionText,
        source: tab.url ? new URL(tab.url).hostname + new URL(tab.url).pathname : ''
      }).catch(() => {});
    }, 500);
  }
});

// ── Message Relay ──
// Relay messages between content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    // Open side panel on the sender's tab
    if (sender.tab) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .catch((e) => console.error('Could not open side panel:', e));
    }
    return;
  }

  if (message.type === 'WALLET_STATE_UPDATE') {
    // Store in extension storage
    if (message.account) {
      chrome.storage.local.set({
        walletState: { account: message.account, chainId: message.chainId }
      });
    } else {
      chrome.storage.local.remove(['walletState']);
    }
    // Relay to side panel (it may or may not be open)
    // The side panel will also read from storage on init
    return;
  }

  if (message.type === 'GET_WALLET_STATE') {
    chrome.storage.local.get(['walletState'], (result) => {
      sendResponse(result.walletState || null);
    });
    return true; // Async response
  }

  if (message.type === 'TEXT_SELECTED') {
    // The content script sent selected text — relay to side panel
    // Side panel is also a chrome.runtime listener, so this will reach it
    return;
  }
});

// ── Tab Update Listener ──
// Track when user navigates to the main site (for wallet state sync)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      // If the user visits the main Indelible site, try to get wallet state
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        // Content script handles the actual detection
      }
    } catch (e) {
      // Not a valid URL
    }
  }
});
