// Chrome Extension Popup - Wallet Dashboard
// Uses window.ethereum for wallet functionality

// DOM Elements
const loadingState = document.getElementById('loading-state');
const connectState = document.getElementById('connect-state');
const dashboardState = document.getElementById('dashboard-state');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const copyBtn = document.getElementById('copy-btn');
const walletAddress = document.getElementById('wallet-address');
const walletAvatar = document.getElementById('wallet-avatar');
const walletNetwork = document.getElementById('wallet-network');
const walletBalance = document.getElementById('wallet-balance');
const dappsList = document.getElementById('dapps-list');
const dappCount = document.getElementById('dapp-count');
const toast = document.getElementById('toast');

// State
let currentAccount = null;
let currentChainId = null;

// Network configurations
const networks = {
  1: { name: 'Ethereum', color: '#627eea' },
  42161: { name: 'Arbitrum', color: '#28a0f0' },
  8453: { name: 'Base', color: '#0052ff' }
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Check if already connected
  const stored = await chrome.storage.local.get(['walletState']);
  if (stored.walletState) {
    currentAccount = stored.walletState.account;
    currentChainId = stored.walletState.chainId;
  }

  // Listen for wallet events
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
  }

  // Setup event listeners
  connectBtn.addEventListener('click', connect);
  disconnectBtn.addEventListener('click', disconnect);
  copyBtn.addEventListener('click', copyAddress);

  // Show appropriate state
  showState();
  await updateBalance();
  await updateDappsList();
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
  // Truncate address
  const truncated = currentAccount.slice(0, 6) + '...' + currentAccount.slice(-4);
  walletAddress.textContent = truncated;

  // Avatar initials
  walletAvatar.textContent = currentAccount.slice(2, 4).toUpperCase();

  // Network
  const network = networks[currentChainId] || { name: 'Unknown', color: '#71717a' };
  walletNetwork.innerHTML = '<span class="network-dot" style="background:' + network.color + '"></span>' + network.name;
}

async function connect() {
  if (!window.ethereum) {
    showToast('No wallet detected. Please install MetaMask or another Web3 wallet.');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    currentAccount = accounts[0];

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    currentChainId = parseInt(chainId, 16);

    // Save state
    await chrome.storage.local.set({
      walletState: {
        account: currentAccount,
        chainId: currentChainId
      }
    });

    // Track this connection
    const origin = await getCurrentTabOrigin();
    if (origin) {
      await addConnectedDapp(origin);
    }

    showState();
    await updateBalance();
    await updateDappsList();
    showToast('Wallet connected!');
  } catch (err) {
    console.error('Connection error:', err);
    showToast('Failed to connect wallet');
  }
}

async function disconnect() {
  currentAccount = null;
  currentChainId = null;
  await chrome.storage.local.remove('walletState');
  showState();
  showToast('Wallet disconnected');
}

async function copyAddress() {
  if (currentAccount) {
    await navigator.clipboard.writeText(currentAccount);
    showToast('Address copied!');
  }
}

async function updateBalance() {
  if (!currentAccount || !window.ethereum) return;

  try {
    const balanceHex = await window.ethereum.request({
      method: 'eth_getBalance',
      params: [currentAccount, 'latest']
    });
    const balanceWei = BigInt(balanceHex);
    const balanceEth = Number(balanceWei) / 1e18;
    walletBalance.textContent = balanceEth.toFixed(4);
  } catch (err) {
    console.error('Balance fetch error:', err);
    walletBalance.textContent = '0.00';
  }
}

async function updateDappsList() {
  const stored = await chrome.storage.local.get(['connectedDapps']);
  const dapps = stored.connectedDapps || [];

  dappCount.textContent = dapps.length;

  // Clear existing content safely
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
    favicon.textContent = getDappInitial(dapp.name);

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

function getDappInitial(name) {
  if (!name) return 'D';
  return name.charAt(0).toUpperCase();
}

async function addConnectedDapp(origin) {
  const stored = await chrome.storage.local.get(['connectedDapps']);
  let dapps = stored.connectedDapps || [];

  // Parse origin for name
  let hostname;
  try {
    const url = new URL(origin);
    hostname = url.hostname.replace('www.', '');
    const parts = hostname.split('.');
    const name = parts[0];
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

    // Check if already exists
    const exists = dapps.some(function(d) { return d.origin === origin; });
    if (!exists) {
      dapps.push({ origin: origin, name: capitalizedName });
      await chrome.storage.local.set({ connectedDapps: dapps });
    }
  } catch (e) {
    // Invalid URL, skip
  }
}

async function getCurrentTabOrigin() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url);
      return url.origin;
    }
  } catch (err) {
    console.error('Error getting tab origin:', err);
  }
  return null;
}

function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    disconnect();
  } else {
    currentAccount = accounts[0];
    chrome.storage.local.set({
      walletState: { account: currentAccount, chainId: currentChainId }
    });
    showState();
    updateBalance();
  }
}

function handleChainChanged(chainId) {
  currentChainId = parseInt(chainId, 16);
  chrome.storage.local.set({
    walletState: { account: currentAccount, chainId: currentChainId }
  });
  showState();
  updateBalance();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}
