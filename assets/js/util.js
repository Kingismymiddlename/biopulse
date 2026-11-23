// Shared helpers.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function safeUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch {
    return null;
  }
}
export const fmtInt = (n) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-US'));

export function timeAgo(iso) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  if (m < 1440) return Math.round(m / 60) + 'h ago';
  return Math.round(m / 1440) + 'd ago';
}
export function shortDate(iso) {
  const d = new Date(iso && iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).toUpperCase();
}
export function longDate(iso) {
  const d = new Date(iso && iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  return isNaN(d) ? String(iso || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
export function slug(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'account';
}

export const local = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage full or blocked */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));

export function toast(msg, { action, onAction, kind = 'info', ms = 5000 } = {}) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').addEventListener('click', () => {
    onAction && onAction();
    el.remove();
  });
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function copyText(text, btn) {
  const done = () => {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = old), 1400);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch {
      /* ignore */
    }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

export const csvCell = (v) => {
  const s = String(v ?? '');
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
};

export function skeleton(n, cls = 'skel') {
  return `<div class="${cls}"></div>`.repeat(n);
}
