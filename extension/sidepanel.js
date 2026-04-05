// ══════════════════════════════════════════════════
// Indelible Side Panel — Controller
// Matches website behavior from SearchResults.tsx,
// HeroSection.tsx, NavBar.tsx
// ══════════════════════════════════════════════════

const API_BASE = 'http://localhost:3000';
const WALLET_STORAGE_KEY = 'indelible_wallet_state';

// ── State ──
let walletAccount = null;
let walletChainId = null;
let indlBalance = 0;
let selectedText = '';
let selectedSource = '';
let lastResult = null;

// ── DOM References ──
const els = {};

// ══════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Cache DOM elements
  els.stateLoading   = document.getElementById('state-loading');
  els.stateConnect   = document.getElementById('state-connect');
  els.stateQuery     = document.getElementById('state-query');
  els.stateSearching = document.getElementById('state-searching');
  els.stateResults   = document.getElementById('state-results');
  els.stateError     = document.getElementById('state-error');

  els.balanceBadge   = document.getElementById('balance-badge');
  els.balanceCount   = document.getElementById('balance-count');
  els.balanceDot     = document.getElementById('balance-dot');
  els.disconnectWrap = document.getElementById('disconnect-wrap');

  els.selectionPreview = document.getElementById('selection-preview');
  els.selectionText    = document.getElementById('selection-text');
  els.selectionSource  = document.getElementById('selection-source');

  els.queryInput     = document.getElementById('query-input');
  els.detailsBody    = document.getElementById('details-body');
  els.detailsInput   = document.getElementById('details-input');

  els.btnSearch        = document.getElementById('btn-search');
  els.btnOpenSite      = document.getElementById('btn-open-site');
  els.btnClearSel      = document.getElementById('btn-clear-selection');
  els.btnClearQuery    = document.getElementById('btn-clear-query');
  els.btnToggleDetails = document.getElementById('btn-toggle-details');
  els.btnBack          = document.getElementById('btn-back');
  els.btnRetry         = document.getElementById('btn-retry');
  els.btnDisconnect    = document.getElementById('btn-disconnect');
  els.linkHome         = document.getElementById('link-home');

  els.searchingText   = document.getElementById('searching-text');
  els.summaryAnswer   = document.getElementById('summary-answer');
  els.summaryMeta     = document.getElementById('summary-meta');
  els.sourcesSubtitle = document.getElementById('sources-subtitle');
  els.modeBadge       = document.getElementById('mode-badge');
  els.sourcesList     = document.getElementById('sources-list');
  els.errorMessage    = document.getElementById('error-message');
  els.balanceWarning  = document.getElementById('balance-warning');
  els.linkGetToken    = document.getElementById('link-get-token');
  els.suggestions     = document.getElementById('suggestions');

  // ── Event Listeners ──
  els.btnOpenSite.addEventListener('click', () => {
    chrome.tabs.create({ url: API_BASE });
  });

  els.linkHome.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: API_BASE });
  });

  els.btnClearSel.addEventListener('click', clearSelection);

  els.btnClearQuery.addEventListener('click', () => {
    els.queryInput.value = '';
    els.queryInput.style.height = 'auto';
    updateSearchButton();
    els.queryInput.focus();
  });

  els.btnToggleDetails.addEventListener('click', toggleDetails);
  els.btnSearch.addEventListener('click', handleSearch);
  els.btnBack.addEventListener('click', goBackToQuery);
  els.btnRetry.addEventListener('click', goBackToQuery);

  els.btnDisconnect.addEventListener('click', async () => {
    walletAccount = null;
    walletChainId = null;
    indlBalance = 0;
    await chrome.storage.local.remove(['walletState']);
    // Notify content script
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'DISCONNECT_WALLET' });
      }
    } catch (e) {}
    renderState();
  });

  els.linkGetToken.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: API_BASE + '/get-token' });
  });

  // Auto-resize textarea
  els.queryInput.addEventListener('input', () => {
    autoResize(els.queryInput);
    updateSearchButton();
  });

  els.queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  });

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      els.queryInput.value = chip.dataset.query;
      autoResize(els.queryInput);
      updateSearchButton();
      els.queryInput.focus();
    });
  });

  // ── Listen for messages from background/content ──
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TEXT_SELECTED') {
      receiveSelectedText(msg.text, msg.source);
    }
    if (msg.type === 'WALLET_STATE_UPDATE') {
      walletAccount = msg.account;
      walletChainId = msg.chainId;
      indlBalance = msg.indlBalance || 0;
      saveAndRender();
    }
  });

  // ── Load wallet state from storage ──
  try {
    const stored = await chrome.storage.local.get(['walletState']);
    if (stored.walletState) {
      walletAccount = stored.walletState.account;
      walletChainId = stored.walletState.chainId;
      indlBalance = stored.walletState.indlBalance || 0;
    }
  } catch (e) {
    console.log('Could not read wallet state');
  }

  renderState();
}

// ══════════════════════════════════════════════════
// State Rendering
// ══════════════════════════════════════════════════

function showOnly(stateEl) {
  [els.stateLoading, els.stateConnect, els.stateQuery,
   els.stateSearching, els.stateResults, els.stateError]
    .forEach(el => el.classList.add('hidden'));
  stateEl.classList.remove('hidden');
}

function renderState() {
  if (walletAccount) {
    showOnly(els.stateQuery);
    renderWalletInfo();
  } else {
    showOnly(els.stateConnect);
    els.balanceBadge.style.display = 'none';
    els.disconnectWrap.style.display = 'none';
  }
}

function renderWalletInfo() {
  // Show balance badge + disconnect button (matching NavBar behavior)
  els.balanceBadge.style.display = 'flex';
  els.disconnectWrap.style.display = 'flex';

  // Update badge with current balance from storage
  updateBalanceBadge();
}

// ══════════════════════════════════════════════════
// INDL Balance Badge — reads from chrome.storage
// Balance is synced from the main site via useWalletSync
// Same display logic as NavBar.tsx
// ══════════════════════════════════════════════════

function updateBalanceBadge() {
  // Update the count — matches NavBar: {indlCount} Requests
  els.balanceCount.textContent = indlBalance;

  // Dot color — matches NavBar.tsx exactly:
  // indlCount > 5 → green, indlCount > 0 → orange, 0 → red
  if (indlBalance > 5) {
    els.balanceDot.style.background = 'var(--landing-success)';   // #22c55e
  } else if (indlBalance > 0) {
    els.balanceDot.style.background = 'var(--orange-500)';        // #f97316
  } else {
    els.balanceDot.style.background = 'var(--red-500)';           // #e13b3b
  }

  // Show/hide low balance warning
  if (indlBalance === 0) {
    els.balanceWarning.classList.remove('hidden');
  } else {
    els.balanceWarning.classList.add('hidden');
  }
}

function saveAndRender() {
  if (walletAccount) {
    chrome.storage.local.set({
      walletState: { account: walletAccount, chainId: walletChainId, indlBalance: indlBalance }
    });
  }
  renderState();
}

function updateSearchButton() {
  const hasQuery = els.queryInput.value.trim().length > 0;
  els.btnSearch.disabled = !hasQuery;
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// ══════════════════════════════════════════════════
// Text Selection
// ══════════════════════════════════════════════════

function receiveSelectedText(text, source) {
  if (!text || !text.trim()) return;

  selectedText = text.trim();
  selectedSource = source || '';

  els.selectionText.textContent = selectedText;
  els.selectionSource.textContent = selectedSource;
  els.selectionPreview.classList.remove('hidden');

  // Auto-populate query if empty
  if (!els.queryInput.value.trim()) {
    els.queryInput.value = selectedText.length > 200
      ? selectedText.substring(0, 200) + '…'
      : selectedText;
    autoResize(els.queryInput);
    updateSearchButton();
  }

  // Ensure query state is showing
  if (walletAccount) {
    showOnly(els.stateQuery);
  }
}

function clearSelection() {
  selectedText = '';
  selectedSource = '';
  els.selectionPreview.classList.add('hidden');
}

// ══════════════════════════════════════════════════
// Details Toggle
// ══════════════════════════════════════════════════

function toggleDetails() {
  const isOpen = !els.detailsBody.classList.contains('hidden');
  if (isOpen) {
    els.detailsBody.classList.add('hidden');
    els.btnToggleDetails.classList.remove('open');
  } else {
    els.detailsBody.classList.remove('hidden');
    els.btnToggleDetails.classList.add('open');
    els.detailsInput.focus();
  }
}

// ══════════════════════════════════════════════════
// Search
// ══════════════════════════════════════════════════

async function handleSearch() {
  const query = els.queryInput.value.trim();
  if (!query || !walletAccount) return;

  // Build full query with context
  const details = els.detailsInput ? els.detailsInput.value.trim() : '';
  let fullQuery = query;
  if (selectedText && selectedText !== query) {
    fullQuery = 'Context: "' + selectedText + '"\n\nQuestion: ' + query;
  }
  if (details) {
    fullQuery += '\n\nAdditional details: ' + details;
  }

  // Show searching state — matches website loading behavior
  showOnly(els.stateSearching);
  els.searchingText.textContent = 'Opening payment page…';

  try {
    // Open main site search page (handles INDL payment + query)
    const searchUrl = API_BASE + '/search?q=' + encodeURIComponent(fullQuery) + '&from=extension';
    chrome.tabs.create({ url: searchUrl });

    els.searchingText.textContent = 'Redirected to main site…';

    // Show redirection confirmation
    setTimeout(() => {
      showRedirectResult(fullQuery);
    }, 1500);

  } catch (err) {
    showError(err.message || 'Search failed');
  }
}

function showRedirectResult(query) {
  showOnly(els.stateResults);

  els.summaryAnswer.textContent = 'Your search has been opened on the main Indelible website where the INDL payment will be processed. Check the browser tab that just opened to see your results.';
  els.summaryMeta.textContent = 'Payment required on main site';
  els.sourcesSubtitle.textContent = 'Results available on main site';
  els.modeBadge.textContent = '';
  els.sourcesList.innerHTML = '<div class="sources-empty">Results will appear on the main site tab.</div>';
}

// Direct API search (for when payment is handled externally)
async function directSearch(query) {
  showOnly(els.stateSearching);
  els.searchingText.textContent = 'Searching…';

  try {
    const res = await fetch(API_BASE + '/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Request failed (' + res.status + ')');
    }

    const data = await res.json();
    lastResult = data;
    renderResults(data);

  } catch (err) {
    showError(err.message || 'Search failed');
  }
}

// ══════════════════════════════════════════════════
// Results Rendering — matches SearchResults.tsx
// ══════════════════════════════════════════════════

function renderResults(data) {
  showOnly(els.stateResults);

  // Summary — matches getSummaryMessage() from SearchResults
  let answer = data.output?.answer || '';
  if (!answer && data.output?.limitations) {
    const lim = data.output.limitations;
    if (lim.includes('No chunks') || lim.includes('No relevant') || lim.includes('Insufficient')) {
      answer = "I couldn't find any relevant content in the database that matches your question. This could mean the topic hasn't been documented yet, or the search terms don't match what's stored. Try different keywords or check back later.";
    } else {
      answer = lim;
    }
  }
  if (!answer) answer = 'No response generated.';

  els.summaryAnswer.textContent = answer;

  const citCount = data.output?.citations?.length || 0;
  els.summaryMeta.textContent = citCount + ' source' + (citCount !== 1 ? 's' : '') + ' retrieved' + (data.retrievalPassed ? '' : ' • Retrieval limited');
  els.sourcesSubtitle.textContent = 'Found ' + citCount + ' relevant quotes';
  els.modeBadge.textContent = 'Mode: ' + (data.mode || '—');

  // Render source cards — matches SearchResults quote cards
  els.sourcesList.innerHTML = '';

  if (citCount === 0) {
    els.sourcesList.innerHTML = '<div class="sources-empty">No source documents found for this query.</div>';
    return;
  }

  data.output.citations.forEach((cit, i) => {
    const evidence = data.output.evidence?.[i] || '';
    const author = evidence
      ? evidence.split('-chunk-')[0]?.replace('doc-', 'Document ').toUpperCase() || 'Unknown'
      : 'Unknown';
    const initials = 'SC';
    const date = cit.observedAt ? new Date(cit.observedAt).toLocaleDateString() : '';
    const source = cit.sourceUrl || cit.storagePointer || '';

    const card = document.createElement('div');
    card.className = 'source-card';
    card.innerHTML =
      // Quote block — matches SearchResults
      '<div class="source-quote">' +
        '<div class="source-quote-header">' +
          '<i class="fa-solid fa-quote-left"></i>' +
          '<p>' + escapeHtml(cit.quote) + '</p>' +
        '</div>' +
      '</div>' +
      // Author & Source — matches SearchResults
      '<div class="source-meta-row">' +
        '<div class="source-author">' +
          '<div class="source-avatar"><span>' + escapeHtml(initials) + '</span></div>' +
          '<span class="source-author-name">' + escapeHtml(author) + '</span>' +
        '</div>' +
        '<div class="source-details">' +
          (source ? '<div class="source-detail-item"><i class="fa-solid fa-file-lines"></i><span>' + escapeHtml(truncateStr(source, 35)) + '</span></div>' : '') +
          (date ? '<div class="source-detail-item"><i class="fa-solid fa-calendar-days"></i><span>' + escapeHtml(date) + '</span></div>' : '') +
        '</div>' +
      '</div>';

    els.sourcesList.appendChild(card);
  });
}

// ══════════════════════════════════════════════════
// Navigation
// ══════════════════════════════════════════════════

function goBackToQuery() {
  lastResult = null;
  showOnly(els.stateQuery);
}

function showError(message) {
  els.errorMessage.textContent = message;
  showOnly(els.stateError);
}

// ══════════════════════════════════════════════════
// Utilities
// ══════════════════════════════════════════════════

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncateStr(str, max) {
  return str.length > max ? str.substring(0, max) + '…' : str;
}
