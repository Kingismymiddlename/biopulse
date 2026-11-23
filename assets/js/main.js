// BioPulse v3 entry: routing, top bar, boot.
import { $, $$, esc, on, emit, local, toast } from './util.js';
import { api, apiBase, backendMissing } from './api.js';
import { S, parseHash, buildHash, openWorkspace, startDemo, scoreAccounts, scoresStale, profile } from './ws.js';
import { M, loadNews, loadFda, showMarket, renderMarket, wireMarket, health, loadQuotes } from './market.js';
import { loadEvents, renderEvents, wireEvents } from './events.js';
import { V, renderWeek, renderAccounts, renderSettings, renderPanel, openPanel, closePanel, wireViews, wireSettings, wireOnboarding, openOnboarding } from './views.js';

const VIEWS = ['week', 'accounts', 'market', 'events', 'settings'];
let current = null;

function render(view = current) {
  if (view === 'week') renderWeek();
  else if (view === 'accounts') renderAccounts();
  else if (view === 'market') showMarket();
  else if (view === 'events') renderEvents();
  else if (view === 'settings') renderSettings();
}

function route() {
  const { view, a } = parseHash();
  const v = VIEWS.includes(view) ? view : 'week';
  if (v !== current) {
    current = v;
    VIEWS.forEach((x) => {
      const sec = $('#view-' + x);
      sec.hidden = x !== v;
      const link = $(`.nav a[data-view="${x}"]`);
      link.classList.toggle('active', x === v);
      if (x === v) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }
  $$('.nav a').forEach((l) => (l.href = buildHash({ view: l.dataset.view })));
  render(v);
  if (a && S.ws && S.ws.accounts.some((x) => x.id === a)) {
    if (V.panel !== a) openPanel(a);
  } else if (V.panel && !a) closePanel();
}

function renderChip() {
  const items = Object.values(S.healthItems || {});
  const dot = $('#health-dot');
  const txt = $('#health-text');
  if (backendMissing()) {
    dot.className = 'dot bad';
    txt.textContent = 'Backend not connected';
    return;
  }
  if (!items.length) return;
  const ok = items.filter((v) => v.level === 'ok').length;
  const bad = items.filter((v) => v.level === 'bad').length;
  dot.className = 'dot ' + (bad === 0 && ok === items.length ? 'ok' : ok === 0 ? 'bad' : 'warn');
  txt.textContent = `${ok}/${items.length} sources live`;
}

function renderWsChip() {
  const el = $('#ws-chip');
  if (S.mode === 'workspace') el.innerHTML = `<span class="dot ok"></span>${esc(profile().firm || 'My workspace')} · ${S.ws.accounts.length} accounts`;
  else if (S.mode === 'demo') el.innerHTML = '<span class="dot warn"></span>Demo';
  else el.innerHTML = '<span class="dot"></span>No workspace';
}

function banner(html) {
  const b = $('#banner');
  b.hidden = !html;
  if (html) b.innerHTML = html;
}

async function checkHealth() {
  if (backendMissing()) {
    banner('This copy is on GitHub Pages and is not connected to its backend. Open <b>Settings</b> and add the Netlify site URL, or set <code>apiBase</code> in <code>assets/config.js</code>.');
    return;
  }
  try {
    const { data } = await api('/api/health', { timeout: 10000 });
    S.health = data;
    health('ai', 'AI (Groq)', data.ai.configured ? 'ok' : 'bad', data.ai.configured ? data.ai.model : 'GROQ_API_KEY not set');
    banner(null);
  } catch (e) {
    banner(`Can't reach the BioPulse backend at <code>${esc(apiBase() || location.origin)}</code> (${esc(e.message)}). Saved copies are shown where available.`);
    health('backend', 'Backend', 'bad', e.message);
  }
}

async function loadWorkspaceFromUrl() {
  const { w, demo } = parseHash();
  if (demo) return startDemo();
  const id = w || local.get('bp:lastWs');
  if (!id || backendMissing()) return;
  try {
    await openWorkspace(id);
    if (!w) history.replaceState(null, '', buildHash({}));
  } catch (e) {
    if (e.code === 'not_found' || e.code === 'bad_id') {
      if (local.get('bp:lastWs') === id) local.del('bp:lastWs');
      banner(`That workspace link doesn't exist or was deleted. <button type="button" class="linkish" data-act="onboard">Start a new workspace</button>`);
    } else {
      toast("Couldn't open your workspace: " + e.message, { kind: 'error', action: 'Retry', onAction: () => location.reload() });
    }
  }
}

function tickClock() {
  const d = new Date();
  $('#clock').textContent = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${d.toISOString().slice(11, 16)} UTC`;
}

async function boot() {
  tickClock();
  setInterval(tickClock, 30000);
  wireViews();
  wireSettings();
  wireOnboarding();
  wireMarket();
  wireEvents();
  on('workspace', () => {
    renderWsChip();
    render();
    renderPanel();
  });
  on('accounts', () => {
    renderWsChip();
    if (current === 'week' || current === 'accounts') render();
    renderPanel();
  });
  on('scores', () => {
    if (current === 'week' || current === 'accounts') render();
    renderPanel();
  });
  on('votes', () => {
    renderPanel();
    if (current === 'settings') render();
  });
  on('profile', () => renderWsChip());
  on('news', () => {
    if (current === 'week') render();
    if (current === 'market') renderMarket();
  });
  on('fda', () => {
    if (current === 'week') render();
    if (current === 'market') renderMarket();
  });
  on('health', renderChip);
  on('route', route);
  on('onboard', openOnboarding);
  window.addEventListener('hashchange', route);
  $('#panel-scrim').addEventListener('click', closePanel);
  $('#health-btn').addEventListener('click', () => (location.hash = buildHash({ view: 'settings' })));

  renderWsChip();
  await Promise.all([loadEvents(), checkHealth()]);
  await loadWorkspaceFromUrl();
  renderWsChip();
  route();
  if (!backendMissing()) {
    loadNews();
    loadFda();
    if (S.ws && scoresStale()) scoreAccounts();
  }
  // Background refresh while the tab is visible.
  setInterval(() => {
    if (document.hidden || backendMissing()) return;
    loadNews();
    if (S.ws && scoresStale(30)) scoreAccounts();
  }, 10 * 60000);
  setInterval(() => !document.hidden && !backendMissing() && current === 'market' && loadQuotes(), 5 * 60000);
}

boot();

// Exposed for tests only.
window.__biopulse = { S, M, V };
