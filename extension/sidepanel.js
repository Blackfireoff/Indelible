// ══════════════════════════════════════════════════
// Indelible Side Panel — Main Controller
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
  // Cache all DOM elements
  els.stateLoading   = document.getElementById('state-loading');
  els.stateConnect   = document.getElementById('state-connect');
  els.stateQuery     = document.getElementById('state-query');
  els.stateSearching = document.getElementById('state-searching');
  els.stateResults   = document.getElementById('state-results');
  els.stateError     = document.getElementById('state-error');

  els.walletBadge     = document.getElementById('wallet-badge');
  els.walletBadgeText = document.getElementById('wallet-badge-text');
  els.balanceBadge    = document.getElementById('balance-badge');
  els.balanceCount    = document.getElementById('balance-count');
  els.balanceDot      = document.getElementById('balance-dot');

  els.selectionPreview = document.getElementById('selection-preview');
  els.selectionText    = document.getElementById('selection-text');
  els.selectionSource  = document.getElementById('selection-source');

  els.queryInput   = document.getElementById('query-input');
  els.detailsBody  = document.getElementById('details-body');
  els.detailsInput = document.getElementById('details-input');

  els.btnSearch       = document.getElementById('btn-search');
  els.btnOpenSite     = document.getElementById('btn-open-site');
  els.btnClearSel     = document.getElementById('btn-clear-selection');
  els.btnToggleDetails = document.getElementById('btn-toggle-details');
  els.detailsChevron  = document.getElementById('details-chevron');
  els.btnBack         = document.getElementById('btn-back');
  els.btnRetry        = document.getElementById('btn-retry');

  els.searchingText  = document.getElementById('searching-text');
  els.summaryAnswer  = document.getElementById('summary-answer');
  els.summaryMeta    = document.getElementById('summary-meta');
  els.sourcesCount   = document.getElementById('sources-count');
  els.sourcesList    = document.getElementById('sources-list');
  els.errorMessage   = document.getElementById('error-message');
  els.balanceWarning = document.getElementById('balance-warning');
  els.linkGetToken   = document.getElementById('link-get-token');

  // ── Event Listeners ──
  els.btnOpenSite.addEventListener('click', openMainSite);
  els.btnClearSel.addEventListener('click', clearSelection);
  els.btnToggleDetails.addEventListener('click', toggleDetails);
  els.btnSearch.addEventListener('click', handleSearch);
  els.btnBack.addEventListener('click', goBackToQuery);
  els.btnRetry.addEventListener('click', goBackToQuery);
  els.linkGetToken.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: API_BASE + '/get-token' });
  });

  els.queryInput.addEventListener('input', updateSearchButton);
  els.queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  });

  // ── Listen for messages from background/content ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'TEXT_SELECTED') {
      receiveSelectedText(msg.text, msg.source);
    }
    if (msg.type === 'WALLET_STATE_UPDATE') {
      walletAccount = msg.account;
      walletChainId = msg.chainId;
      saveAndRender();
    }
  });

  // ── Load wallet state from storage ──
  try {
    const stored = await chrome.storage.local.get(['walletState']);
    if (stored.walletState) {
      walletAccount = stored.walletState.account;
      walletChainId = stored.walletState.chainId;
    }
  } catch (e) {
    console.log('Could not read wallet state from storage');
  }

  renderState();
}

// ══════════════════════════════════════════════════
// State Rendering
// ══════════════════════════════════════════════════

function showOnly(stateId) {
  const allStates = [
    els.stateLoading,
    els.stateConnect,
    els.stateQuery,
    els.stateSearching,
    els.stateResults,
    els.stateError
  ];
  allStates.forEach(el => el.classList.add('hidden'));
  stateId.classList.remove('hidden');
}

function renderState() {
  if (walletAccount) {
    showOnly(els.stateQuery);
    renderWalletInfo();
  } else {
    showOnly(els.stateConnect);
    els.walletBadge.style.display = 'none';
    els.balanceBadge.style.display = 'none';
  }
}

function renderWalletInfo() {
  const truncated = walletAccount.slice(0, 6) + '…' + walletAccount.slice(-4);
  els.walletBadgeText.textContent = truncated;
  els.walletBadge.style.display = 'flex';
  els.balanceBadge.style.display = 'flex';
  // Note: balance checking would require API call or reading from storage
  // For now, we display a placeholder that gets updated
  els.balanceDot.style.background = 'var(--success)';
}

function saveAndRender() {
  if (walletAccount) {
    chrome.storage.local.set({
      walletState: { account: walletAccount, chainId: walletChainId }
    });
  }
  renderState();
}

function updateSearchButton() {
  const hasQuery = els.queryInput.value.trim().length > 0;
  els.btnSearch.disabled = !hasQuery;
}

// ══════════════════════════════════════════════════
// Text Selection
// ══════════════════════════════════════════════════

function receiveSelectedText(text, source) {
  if (!text || !text.trim()) return;

  selectedText = text.trim();
  selectedSource = source || '';

  // Show the preview
  els.selectionText.textContent = selectedText;
  els.selectionSource.textContent = selectedSource;
  els.selectionPreview.classList.remove('hidden');

  // Auto-populate query if empty
  if (!els.queryInput.value.trim()) {
    els.queryInput.value = selectedText.length > 200
      ? selectedText.substring(0, 200) + '…'
      : selectedText;
    updateSearchButton();
  }

  // Make sure we're on the query state
  if (!walletAccount) return;
  showOnly(els.stateQuery);
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
// Search / Query
// ══════════════════════════════════════════════════

async function handleSearch() {
  const query = els.queryInput.value.trim();
  if (!query) return;
  if (!walletAccount) return;

  // Build the full query with details
  const details = els.detailsInput.value.trim();
  let fullQuery = query;
  if (selectedText && selectedText !== query) {
    fullQuery = `Context: "${selectedText}"\n\nQuestion: ${query}`;
  }
  if (details) {
    fullQuery += `\n\nAdditional details: ${details}`;
  }

  // Show searching state
  showOnly(els.stateSearching);
  els.searchingText.textContent = 'Opening payment page…';

  try {
    // Open the main site search page in a new tab to handle the INDL payment
    // The main site will handle wallet transaction + API call
    // We redirect to the main site's search page
    const searchUrl = API_BASE + '/search?q=' + encodeURIComponent(fullQuery) + '&from=extension';
    chrome.tabs.create({ url: searchUrl });

    // Meanwhile, also try a direct API call if we can skip payment (for dev/testing)
    // In production, the main site handles payment
    els.searchingText.textContent = 'Redirected to main site for payment…';

    // After a brief delay, show a message to check the main site
    setTimeout(() => {
      showSearchingDone(fullQuery);
    }, 2000);

  } catch (err) {
    showError(err.message || 'Search failed');
  }
}

function showSearchingDone(query) {
  // Show results state with a message about checking the main site
  showOnly(els.stateResults);

  els.summaryAnswer.textContent = 'Your search has been opened on the main Indelible website where the INDL payment will be processed. Check the browser tab that just opened to see your results.';
  els.summaryMeta.textContent = 'Payment required on main site';
  els.sourcesCount.textContent = '0';
  els.sourcesList.innerHTML = `
    <div style="text-align:center; padding:20px; color:var(--text-secondary); font-size:13px;">
      Results will appear on the main site tab.
    </div>
  `;
}

// Direct API search (for when payment is handled or free tier)
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
      throw new Error(errData.error || `Request failed (${res.status})`);
    }

    const data = await res.json();
    lastResult = data;
    renderResults(data);

  } catch (err) {
    showError(err.message || 'Search failed');
  }
}

// ══════════════════════════════════════════════════
// Results Rendering
// ══════════════════════════════════════════════════

function renderResults(data) {
  showOnly(els.stateResults);

  // Summary
  const answer = data.output?.answer
    || data.output?.limitations
    || 'No response generated.';

  // Clean up "no results" messages
  const cleanAnswer = (data.output?.limitations && (
    data.output.limitations.includes('No chunks') ||
    data.output.limitations.includes('No relevant') ||
    data.output.limitations.includes('Insufficient')
  ))
    ? "I couldn't find relevant content matching your question. Try different keywords or check back later."
    : answer;

  els.summaryAnswer.textContent = cleanAnswer;

  const citCount = data.output?.citations?.length || 0;
  els.summaryMeta.textContent = `${citCount} source${citCount !== 1 ? 's' : ''} retrieved${data.retrievalPassed ? '' : ' • Retrieval limited'}`;
  els.sourcesCount.textContent = citCount;

  // Render source cards
  els.sourcesList.innerHTML = '';

  if (citCount === 0) {
    els.sourcesList.innerHTML = `
      <div style="text-align:center; padding:24px; color:var(--text-secondary); font-size:13px;">
        No source documents found for this query.
      </div>
    `;
    return;
  }

  data.output.citations.forEach((cit, i) => {
    const evidence = data.output.evidence?.[i] || '';
    const author = evidence
      ? evidence.split('-chunk-')[0]?.replace('doc-', '').toUpperCase() || 'Unknown'
      : 'Unknown';
    const initials = author.substring(0, 2);
    const date = cit.observedAt
      ? new Date(cit.observedAt).toLocaleDateString()
      : '';
    const source = cit.sourceUrl || cit.storagePointer || '';

    const card = document.createElement('div');
    card.className = 'source-card';
    card.innerHTML = `
      <div class="source-quote">
        <svg class="source-quote-icon" viewBox="0 0 16 16" fill="none">
          <path d="M3 10.5C3 7.46 5.46 5 8.5 5L8 3C4.13 3 1 6.13 1 10c0 1.9.77 3.62 2 4.87L4.5 13.5C3.56 12.66 3 11.64 3 10.5z"
                fill="currentColor"/>
        </svg>
        <p>${escapeHtml(cit.quote)}</p>
      </div>
      <div class="source-meta">
        <div class="source-author-avatar">${escapeHtml(initials)}</div>
        <span class="source-author-name">${escapeHtml(author)}</span>
        ${source ? `
          <span class="source-divider"></span>
          <div class="source-meta-item">
            <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            <span>${escapeHtml(truncateStr(source, 30))}</span>
          </div>
        ` : ''}
        ${date ? `
          <span class="source-divider"></span>
          <div class="source-meta-item">
            <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M5 1v3M11 1v3M2 7h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            <span>${escapeHtml(date)}</span>
          </div>
        ` : ''}
      </div>
    `;
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

function openMainSite() {
  chrome.tabs.create({ url: API_BASE });
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
