// ══════════════════════════════════════════════════
// Indelible — Background Service Worker
// Side panel toggle, context menu, message relay
// ══════════════════════════════════════════════════

// ── Side Panel Setup ──
// Enable side panel to open on action button click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('sidePanel.setPanelBehavior error:', err));

// ── Side Panel Text Relay State ──
let pendingTextSelection = null;
let pendingTextSource = '';

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
    // Store the selection
    pendingTextSelection = info.selectionText;
    pendingTextSource = tab.url ? new URL(tab.url).hostname + new URL(tab.url).pathname : '';

    // Open the side panel
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
      // Forward text after side panel has time to initialize
      setTimeout(() => {
        if (pendingTextSelection) {
          chrome.runtime.sendMessage({
            type: 'TEXT_SELECTED',
            text: pendingTextSelection,
            source: pendingTextSource
          }).catch(() => {});
          pendingTextSelection = null;
        }
      }, 1000);
    } catch (e) {
      console.error('Could not open side panel:', e);
    }
  }
});

// ── Message Relay ──
// Relay messages between content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    // Open side panel on the sender's tab
    if (sender.tab) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => {
          // Forward any pending text selection to the side panel
          if (pendingTextSelection) {
            setTimeout(() => {
              chrome.runtime.sendMessage({
                type: 'TEXT_SELECTED',
                text: pendingTextSelection,
                source: pendingTextSource
              }).catch(() => {});
              pendingTextSelection = null;
            }, 1000);
          }
        })
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
    // Store for relay when side panel opens
    pendingTextSelection = message.text;
    pendingTextSource = message.source || '';
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
