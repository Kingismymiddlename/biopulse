// Workspace state, persistence, scoring and routing params.
import { api, ApiError, backendMissing } from './api.js';
import { local, emit, toast, slug, reEsc } from './util.js';

export const STAGES = ['Monitoring', 'Contacted', 'Meeting', 'Opportunity', 'Not a fit'];
export const DEFAULT_PROFILE = {
  firm: '',
  offering:
    'Data, analytics and AI consulting for pharma, biotech and medtech: data platforms, clinical and commercial analytics, real-world evidence, and GenAI applications.',
  focus: 'Clinical development, commercial analytics, R&D data',
};
export const DEFAULT_TICKERS = ['XBI', 'IBB', '^NBI', 'LLY', 'NVO', 'MRK', 'PFE', 'AZN', 'VRTX', 'REGN', 'MRNA', 'GILD'];
export const FAMILIES = [
  { id: 'all', label: 'All' },
  { id: 'regulatory', label: 'Regulatory' },
  { id: 'deals', label: 'Deals' },
  { id: 'clinical', label: 'Clinical' },
  { id: 'org', label: 'Leadership & org' },
  { id: 'ai', label: 'AI & digital' },
];
export const TYPE_META = {
  leadership: { family: 'org', cls: 'b-red' },
  acquirer: { family: 'deals', cls: 'b-amber' },
  fda_approval: { family: 'regulatory', cls: 'b-green' },
  financing: { family: 'deals', cls: 'b-amber' },
  fda_rejection: { family: 'regulatory', cls: 'b-red' },
  ai_initiative: { family: 'ai', cls: 'b-blue' },
  pivotal: { family: 'clinical', cls: 'b-blue' },
  new_phase3: { family: 'clinical', cls: 'b-blue' },
  restructuring: { family: 'org', cls: 'b-orange' },
  safety: { family: 'regulatory', cls: 'b-orange' },
  acquired: { family: 'deals', cls: 'b-amber' },
  partnership: { family: 'deals', cls: 'b-amber' },
  trial_surge: { family: 'clinical', cls: 'b-blue' },
  phase2: { family: 'clinical', cls: 'b-blue' },
  mention: { family: 'news', cls: 'b-grey' },
};

export const S = {
  ws: null,
  mode: 'none', // 'workspace' | 'demo' | 'none'
  scores: {},
  scoredAt: null,
  scoring: false,
  scoreError: null,
  prevSeenAt: null,
  health: null,
  packs: null,
};

export const profile = () => ({ ...DEFAULT_PROFILE, ...Object.fromEntries(Object.entries(S.ws?.profile || {}).filter(([, v]) => v)) });
export const profilePayload = () => {
  const p = profile();
  return { firm: p.firm || 'Our firm', offering: p.offering, focus: p.focus };
};
export const tickers = () => (S.ws?.tickers?.length ? S.ws.tickers : DEFAULT_TICKERS);
export const readOnly = () => S.mode === 'demo';

// ── Routing params (hash: #/view?w=ID&a=account) ─────────────────────────────
export function parseHash() {
  const h = location.hash.replace(/^#/, '');
  let view = 'week';
  let qs = '';
  if (h.startsWith('/')) {
    const [path, q = ''] = h.slice(1).split('?');
    view = path || 'week';
    qs = q;
  } else {
    qs = h; // legacy "#w=ID&a=acct"
  }
  const p = new URLSearchParams(qs);
  return { view, w: p.get('w'), a: p.get('a'), demo: p.get('demo') === '1' };
}

export function buildHash({ view, a } = {}) {
  const cur = parseHash();
  const v = view || cur.view || 'week';
  const p = new URLSearchParams();
  if (S.mode === 'workspace' && S.ws?.id) p.set('w', S.ws.id);
  if (S.mode === 'demo') p.set('demo', '1');
  if (a) p.set('a', a);
  const q = p.toString();
  return `#/${v}${q ? '?' + q : ''}`;
}

export function workspaceLink() {
  return S.ws?.id ? `${location.origin}${location.pathname}#/week?w=${S.ws.id}` : '';
}

// ── Loading and saving ──────────────────────────────────────────────────────
export async function openWorkspace(id) {
  const { data } = await api('/api/workspace?id=' + encodeURIComponent(id), { timeout: 15000 });
  setWorkspace(data.workspace, 'workspace');
  S.prevSeenAt = data.workspace.lastSeenAt || null;
  // Record this visit without changing what counts as "new" for this session.
  S.ws.lastSeenAt = new Date().toISOString();
  save({ quiet: true });
  return S.ws;
}

export function setWorkspace(ws, mode) {
  S.ws = ws;
  S.mode = mode;
  if (mode === 'workspace') local.set('bp:lastWs', ws.id);
  const cached = mode === 'workspace' ? local.get('bp:scores:' + ws.id) : null;
  S.scores = cached?.results || {};
  S.scoredAt = cached?.at || null;
  emit('workspace');
}

export async function createWorkspace(draft) {
  const { data } = await api('/api/workspace', { method: 'POST', body: { workspace: draft }, timeout: 15000 });
  setWorkspace(data.workspace, 'workspace');
  S.prevSeenAt = null;
  return S.ws;
}

let saveTimer = null;
let saving = Promise.resolve();
export function save({ quiet = false, immediate = false } = {}) {
  if (S.mode !== 'workspace') return Promise.resolve();
  clearTimeout(saveTimer);
  return new Promise((resolve) => {
    const run = () => {
      saving = saving.then(async () => {
        const base = S.ws.updatedAt;
        try {
          const { data } = await api('/api/workspace?id=' + encodeURIComponent(S.ws.id), {
            method: 'PUT',
            body: { workspace: S.ws, baseUpdatedAt: base },
          });
          const keepSeen = S.ws.lastSeenAt;
          S.ws = { ...data.workspace, lastSeenAt: keepSeen };
          emit('saved');
        } catch (e) {
          if (e instanceof ApiError && e.code === 'conflict' && e.data?.workspace) {
            S.ws = e.data.workspace;
            emit('workspace');
            toast('This workspace was changed on another device. Showing the latest version.', { kind: 'warn' });
          } else if (!quiet) {
            toast("Couldn't save: " + e.message, { kind: 'error', action: 'Retry', onAction: () => save() });
          }
        }
        resolve();
      });
    };
    if (immediate) run();
    else saveTimer = setTimeout(run, 700);
  });
}

export function demoGuard() {
  if (!readOnly()) return false;
  toast('This is the demo. Create your own workspace to save changes.', { action: 'Create workspace', onAction: () => emit('onboard') });
  return true;
}

export async function deleteWorkspace() {
  if (S.mode !== 'workspace') return;
  await api('/api/workspace?id=' + encodeURIComponent(S.ws.id), { method: 'DELETE' });
  local.del('bp:scores:' + S.ws.id);
  local.del('bp:lastWs');
  S.ws = null;
  S.mode = 'none';
  S.scores = {};
  emit('workspace');
}

// ── Accounts ────────────────────────────────────────────────────────────────
export function addAccounts(list) {
  if (demoGuard()) return { added: 0 };
  const have = new Set(S.ws.accounts.map((a) => a.name.toLowerCase()));
  const haveIds = new Set(S.ws.accounts.map((a) => a.id));
  let added = 0;
  let full = false;
  const fresh = [];
  for (const raw of list) {
    const name = String(raw.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!name || have.has(name.toLowerCase())) continue;
    let id = slug(name);
    if (haveIds.has(id)) continue;
    if (S.ws.accounts.length >= 50) {
      full = true;
      break;
    }
    const acct = {
      id,
      name,
      registryName: raw.registryName || null,
      aliases: raw.aliases || [],
      exclude: raw.exclude || [],
      stage: 'Monitoring',
      stageHistory: [],
      note: '',
      addedAt: new Date().toISOString(),
    };
    S.ws.accounts.push(acct);
    fresh.push(acct);
    have.add(name.toLowerCase());
    haveIds.add(id);
    added++;
  }
  if (added) {
    save();
    emit('accounts');
    scoreAccounts(fresh);
  }
  return { added, full };
}

export function removeAccount(id) {
  if (demoGuard()) return;
  S.ws.accounts = S.ws.accounts.filter((a) => a.id !== id);
  delete S.scores[id];
  persistScores();
  save();
  emit('accounts');
}

export function setStage(id, stage) {
  if (demoGuard()) return;
  const a = S.ws.accounts.find((x) => x.id === id);
  if (!a || a.stage === stage || !STAGES.includes(stage)) return;
  const sc = S.scores[id];
  a.stage = stage;
  a.stageHistory = [...(a.stageHistory || []), { stage, at: new Date().toISOString(), score: sc?.score ?? null, signal: sc?.signals?.find((s) => s.type !== 'mention')?.title || null }].slice(-30);
  save();
  emit('accounts');
}

export function updateAccount(id, patch) {
  if (demoGuard()) return;
  const a = S.ws.accounts.find((x) => x.id === id);
  if (!a) return;
  Object.assign(a, patch);
  save();
  emit('accounts');
  scoreAccounts([a]);
}

export function vote(signalId, v) {
  if (demoGuard()) return;
  S.ws.votes = S.ws.votes || {};
  if (S.ws.votes[signalId] === v) delete S.ws.votes[signalId];
  else S.ws.votes[signalId] = v;
  save();
  emit('votes');
}

/** Signal-sourced pipeline (PRD north star): moves out of Monitoring in 30 days with a live signal. */
export function northStar(days = 30) {
  const since = Date.now() - days * 86400000;
  let n = 0;
  for (const a of S.ws?.accounts || []) {
    const hist = a.stageHistory || [];
    for (let i = 0; i < hist.length; i++) {
      const h = hist[i];
      const prev = i === 0 ? 'Monitoring' : hist[i - 1].stage;
      if (Date.parse(h.at) >= since && prev === 'Monitoring' && h.stage !== 'Monitoring' && h.stage !== 'Not a fit' && (h.score || h.signal)) n++;
    }
  }
  return n;
}

// ── Scoring ─────────────────────────────────────────────────────────────────
function persistScores() {
  if (S.mode === 'workspace') local.set('bp:scores:' + S.ws.id, { at: S.scoredAt, results: S.scores });
}

export function scoresStale(maxMin = 30) {
  return !S.scoredAt || Date.now() - S.scoredAt > maxMin * 60000 || (S.ws?.accounts || []).some((a) => !S.scores[a.id]);
}

export async function scoreAccounts(accounts = S.ws?.accounts || []) {
  if (!accounts.length || backendMissing()) return;
  S.scoring = true;
  S.scoreError = null;
  emit('scores');
  const chunks = [];
  for (let i = 0; i < accounts.length; i += 10) chunks.push(accounts.slice(i, i + 10));
  let failed = 0;
  const run = async (chunk) => {
    try {
      const { data } = await api('/api/signals', {
        method: 'POST',
        timeout: 30000,
        body: { accounts: chunk.map(({ id, name, registryName, aliases, exclude }) => ({ id, name, registryName, aliases, exclude })) },
      });
      for (const r of data.results) S.scores[r.id] = { ...r, at: Date.now(), newsOk: data.newsOk };
      emit('scores');
    } catch (e) {
      failed++;
      S.scoreError = e.message;
    }
  };
  // Two batches in flight at a time.
  for (let i = 0; i < chunks.length; i += 2) await Promise.all(chunks.slice(i, i + 2).map(run));
  S.scoring = false;
  if (failed < chunks.length) S.scoredAt = Date.now();
  persistScores();
  emit('scores');
}

export function isNew(sig) {
  return S.prevSeenAt ? Date.parse(sig.date) > Date.parse(S.prevSeenAt) : false;
}

// ── Matching (client copy of the server rule, used for market signals and filters) ──
const SUFFIX = /\s+(therapeutics|pharmaceuticals?|pharma|biosciences?|biotherapeutics|biotech|biologics|bio|biopharma|holdings|group|corporation|corp|inc|ltd|plc|ag|sa|se|nv|a\/s|llc|co|company)\.?$/i;
export function shortName(name) {
  let n = String(name || '').trim();
  for (let i = 0; i < 3 && SUFFIX.test(n); i++) n = n.replace(SUFFIX, '').trim();
  return n !== name && /^[A-Z][A-Za-z0-9-]{4,}$/.test(n) ? n : null;
}
const termsOf = (a) => [a.name, a.registryName, ...(a.aliases || []), shortName(a.name)].filter((t) => t && t.length >= 2);

export function accountMatcher(accounts = S.ws?.accounts || []) {
  const terms = accounts.flatMap(termsOf);
  if (!terms.length) return () => null;
  const re = new RegExp('(^|[^A-Za-z0-9])(' + [...new Set(terms)].sort((x, y) => y.length - x.length).map(reEsc).join('|') + ')(?=$|[^A-Za-z0-9])', 'i');
  return (text) => {
    const m = re.exec(text || '');
    if (!m) return null;
    const hit = m[2].toLowerCase();
    return accounts.find((a) => termsOf(a).some((t) => t.toLowerCase() === hit)) || null;
  };
}

export async function loadPacks() {
  if (S.packs) return S.packs;
  const r = await fetch('data/starter-packs.json');
  S.packs = (await r.json()).packs;
  return S.packs;
}

export async function startDemo() {
  const packs = await loadPacks();
  const accounts = packs[0].accounts.slice(0, 12).map((a) => ({
    id: slug(a.name),
    name: a.name,
    registryName: a.registryName || null,
    aliases: a.aliases || [],
    exclude: a.exclude || [],
    stage: 'Monitoring',
    stageHistory: [],
    note: '',
  }));
  setWorkspace({ id: null, profile: { ...DEFAULT_PROFILE, firm: 'Demo Analytics' }, accounts, tickers: [], votes: {}, digest: { email: '', enabled: false } }, 'demo');
  S.prevSeenAt = new Date(Date.now() - 3 * 86400000).toISOString();
  scoreAccounts();
}
