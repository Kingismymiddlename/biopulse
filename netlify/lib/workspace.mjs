// Workspace model: validation, normalisation and storage.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getItem, setItem, deleteItem, listKeys } from './store.mjs';
import { clean } from './prompts.mjs';

export const STORE = 'biopulse-workspaces';
export const ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const STAGES = ['Monitoring', 'Contacted', 'Meeting', 'Opportunity', 'Not a fit'];
export const MAX_ACCOUNTS = 50;
export const MAX_BYTES = 64 * 1024;
const EMAIL_RE = /^[^\s@<>()"',;]{1,64}@[^\s@<>()"',;]{1,190}\.[A-Za-z]{2,24}$/;

export const newId = () => randomBytes(16).toString('base64url'); // 22 chars
export const newToken = () => randomBytes(16).toString('hex');

export function slug(name) {
  return clean(name, 80).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'account';
}

const list = (v, n, max) =>
  [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => clean(x, max)).filter(Boolean))].slice(0, n);

const iso = (v) => {
  const t = Date.parse(v);
  return isFinite(t) ? new Date(t).toISOString() : null;
};

export function normAccount(a, now = new Date().toISOString()) {
  const name = clean(a?.name, 80);
  if (!name) return null;
  const stage = STAGES.includes(a.stage) ? a.stage : 'Monitoring';
  const history = (Array.isArray(a.stageHistory) ? a.stageHistory : [])
    .map((h) => ({
      stage: STAGES.includes(h?.stage) ? h.stage : null,
      at: iso(h?.at),
      score: Number.isFinite(Number(h?.score)) ? Math.max(0, Math.min(100, Math.round(Number(h.score)))) : null,
      signal: clean(h?.signal, 200) || null,
    }))
    .filter((h) => h.stage && h.at)
    .slice(-30);
  return {
    id: slug(a.id || name),
    name,
    registryName: clean(a.registryName, 80) || null,
    aliases: list(a.aliases, 6, 60),
    exclude: list(a.exclude, 6, 60),
    stage,
    stageHistory: history,
    note: clean(a.note, 500) || '',
    addedAt: iso(a.addedAt) || now,
  };
}

/** Normalise a client-supplied workspace. Server-owned fields come from `prev`. */
export function normWorkspace(input, prev = null) {
  const now = new Date().toISOString();
  const seen = new Set();
  const accounts = [];
  for (const raw of Array.isArray(input?.accounts) ? input.accounts : []) {
    const a = normAccount(raw, now);
    if (!a) continue;
    const key = a.name.toLowerCase();
    if (seen.has(key) || seen.has(a.id)) continue;
    seen.add(key);
    seen.add(a.id);
    accounts.push(a);
    if (accounts.length >= MAX_ACCOUNTS) break;
  }
  const p = input?.profile || {};
  const d = input?.digest || {};
  const email = clean(d.email, 254);
  const votes = {};
  for (const [k, v] of Object.entries(input?.votes || {}).slice(-500)) {
    if (/^[a-z0-9:_-]{1,80}$/i.test(k) && (v === 1 || v === -1)) votes[k] = v;
  }
  return {
    id: prev?.id || input?.id,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    lastSeenAt: iso(input?.lastSeenAt) || prev?.lastSeenAt || now,
    profile: {
      firm: clean(p.firm, 80),
      offering: clean(p.offering, 500),
      focus: clean(p.focus, 200),
    },
    tickers: list(input?.tickers, 16, 12).map((t) => t.toUpperCase()).filter((t) => /^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(t)),
    accounts,
    votes,
    digest: {
      email: email && EMAIL_RE.test(email) ? email : '',
      enabled: Boolean(d.enabled && email && EMAIL_RE.test(email)),
      token: prev?.digest?.token || newToken(),
      lastSentAt: prev?.digest?.lastSentAt || null,
      sentIds: prev?.digest?.sentIds || [],
    },
  };
}

/** What the browser sees: no token, no sent-id log. */
export function publicView(ws) {
  if (!ws) return null;
  const { token, sentIds, ...digest } = ws.digest || {};
  return { ...ws, digest };
}

export function validEmail(e) {
  return EMAIL_RE.test(e || '');
}

export async function loadWorkspace(id) {
  if (!ID_RE.test(id || '')) return null;
  return getItem(STORE, id);
}

export async function saveWorkspace(ws) {
  const size = Buffer.byteLength(JSON.stringify(ws));
  if (size > MAX_BYTES) {
    const e = new Error(`Workspace is too large (${Math.round(size / 1024)} KB, limit 64 KB).`);
    e.status = 413;
    throw e;
  }
  await setItem(STORE, ws.id, ws);
  return ws;
}

export const deleteWorkspace = (id) => deleteItem(STORE, id);
export const listWorkspaceIds = async () => (await listKeys(STORE)).filter((k) => ID_RE.test(k));

export function tokenMatches(ws, token) {
  const a = Buffer.from(String(ws?.digest?.token || ''));
  const b = Buffer.from(String(token || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
