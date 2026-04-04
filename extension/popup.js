// Chrome Extension Popup - Reads wallet state from main site via content script

const WALLET_STORAGE_KEY = 'indelible_wallet_state';
const DAPPS_STORAGE_KEY = 'indelible_connected_dapps';

const networkConfig = {
  1: { name: 'Ethereum', color: '#627eea' },
  42161: { name: 'Arbitrum', color: '#28a0f0' },
  8453: { name: 'Base', color: '#0052ff' }
};

// DOM Elements
let loadingState, connectState, dashboardState;
let connectBtn, disconnectBtn, copyBtn;
let walletAddressEl, walletAvatar, walletNetwork, walletBalance;
let dappsList, dappCount, toast;

let currentAccount = null;
let currentChainId = 1;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Get DOM elements
  loadingState = document.getElementById('loading-state');
  connectState = document.getElementById('connect-state');
  dashboardState = document.getElementById('dashboard-state');
  connectBtn = document.getElementById('connect-btn');
  disconnectBtn = document.getElementById('disconnect-btn');
  copyBtn = document.getElementById('copy-btn');
  walletAddressEl = document.getElementById('wallet-address');
  walletAvatar = document.getElementById('wallet-avatar');
  walletNetwork = document.getElementById('wallet-network');
  walletBalance = document.getElementById('wallet-balance');
  dappsList = document.getElementById('dapps-list');
  dappCount = document.getElementById('dapp-count');
  toast = document.getElementById('toast');

  // Setup event listeners
  connectBtn.addEventListener('click', openMainSite);
  disconnectBtn.addEventListener('click', disconnect);

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'WALLET_STATE_UPDATE') {
      currentAccount = message.account;
      currentChainId = message.chainId || 1;
      showState();
      if (currentAccount) {
        updateDappsList();
      }
    }
  });

  // Fetch initial state from content script
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      // Send message to content script to get wallet state
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_WALLET_STATE' }, (response) => {
        if (response && response.account) {
          currentAccount = response.account;
          currentChainId = response.chainId || 1;
        }
        showState();
        if (currentAccount) {
          updateDappsList();
        }
      });
    }
  } catch (err) {
    console.log('Could not connect to content script, trying storage');
    // Fallback: try to read from extension's own storage
    const stored = await chrome.storage.local.get(['walletState']);
    if (stored.walletState) {
      currentAccount = stored.walletState.account;
      currentChainId = stored.walletState.chainId || 1;
    }
    showState();
    if (currentAccount) {
      updateDappsList();
    }
  }
}

function showState() {
  loadingState.style.display = 'none';
  if (currentAccount) {
    connectState.style.display = 'none';
    dashboardState.style.display = 'flex';
    renderWalletInfo();
  } else {
    connectState.style.display = 'flex';
    dashboardState.style.display = 'none';
  }
}

function renderWalletInfo() {
  const truncated = currentAccount.slice(0, 6) + '...' + currentAccount.slice(-4);
  walletAddressEl.textContent = truncated;
  walletAvatar.textContent = currentAccount.slice(2, 4).toUpperCase();

  const network = networkConfig[currentChainId] || { name: 'Unknown', color: '#71717a' };
  walletNetwork.innerHTML = '<span class="network-dot" style="background:' + network.color + '"></span>' + network.name;
}

function openMainSite() {
  chrome.tabs.create({ url: 'https://indelible.example.com' });
}

async function disconnect() {
  currentAccount = null;
  currentChainId = 1;

  // Clear extension storage
  await chrome.storage.local.remove(['walletState']);

  // Notify content script to clear state
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'DISCONNECT_WALLET' });
    }
  } catch (err) {
    console.log('Could not notify content script');
  }

  showState();
  showToast('Wallet disconnected');
}

async function updateDappsList() {
  const stored = await chrome.storage.local.get(['connectedDapps']);
  const dapps = stored.connectedDapps || [];

  dappCount.textContent = dapps.length;

  dappsList.innerHTML = '';

  if (dapps.length === 0) {
    const noDapps = document.createElement('div');
    noDapps.className = 'no-dapps';
    noDapps.textContent = 'No connected dapps yet';
    dappsList.appendChild(noDapps);
    return;
  }

  dapps.forEach(function(dapp) {
    const item = document.createElement('div');
    item.className = 'dapp-item';

    const favicon = document.createElement('div');
    favicon.className = 'dapp-favicon';
    favicon.textContent = dapp.name ? dapp.name.charAt(0).toUpperCase() : 'D';

    const info = document.createElement('div');
    info.className = 'dapp-info';

    const name = document.createElement('div');
    name.className = 'dapp-name';
    name.textContent = dapp.name;

    const origin = document.createElement('div');
    origin.className = 'dapp-origin';
    origin.textContent = dapp.origin;

    info.appendChild(name);
    info.appendChild(origin);

    const status = document.createElement('div');
    status.className = 'dapp-status';

    item.appendChild(favicon);
    item.appendChild(info);
    item.appendChild(status);
    dappsList.appendChild(item);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}
