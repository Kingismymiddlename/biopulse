// Weekly digest: pick what changed, render the email, send it through Resend.
import { fetchWithTimeout } from './http.mjs';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const safe = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '#';
  } catch {
    return '#';
  }
};

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
}
export const fromAddress = () => (process.env.DIGEST_FROM || 'BioPulse <onboarding@resend.dev>').trim();
export const appUrl = () => (process.env.PUBLIC_APP_URL || process.env.URL || 'http://localhost:8888').replace(/\/+$/, '');

export function maskEmail(e) {
  const [u, d] = String(e).split('@');
  return d ? `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}` : '';
}

/**
 * Choose what goes in the email.
 * weekly: signals not sent before, from the last 8 days, excluding plain mentions.
 * test: the strongest current signals, so a test always shows something real.
 */
export function selectDigest(ws, results, { mode = 'weekly', now = Date.now() } = {}) {
  const sent = new Set(ws.digest?.sentIds || []);
  const cutoff = now - 8 * 86400000;
  const rows = [];
  for (const r of results) {
    const fresh = r.signals.filter(
      (s) => s.type !== 'mention' && (mode === 'test' || (!sent.has(s.id) && Date.parse(s.date) >= cutoff)),
    );
    if (fresh.length) rows.push({ ...r, fresh: fresh.slice(0, 3) });
  }
  rows.sort((a, b) => b.score - a.score);
  return { rows: rows.slice(0, 15), newIds: rows.flatMap((r) => r.fresh.map((s) => s.id)) };
}

export function renderDigest(ws, rows, { mode = 'weekly', now = new Date() } = {}) {
  const base = appUrl();
  const wsLink = (a) => `${base}/#/week?w=${encodeURIComponent(ws.id)}${a ? '&a=' + encodeURIComponent(a) : ''}`;
  const unsub = `${base}/api/unsubscribe?id=${encodeURIComponent(ws.id)}&t=${encodeURIComponent(ws.digest.token)}`;
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const total = rows.length;
  const subject = mode === 'test'
    ? `BioPulse test digest: ${total} account${total === 1 ? '' : 's'} with signals`
    : `BioPulse: ${total} account${total === 1 ? '' : 's'} with new signals this week`;
  const firm = ws.profile?.firm ? ` for ${ws.profile.firm}` : '';

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#13202e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dfe5eb;border-radius:8px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #dfe5eb"><div style="font:700 15px Arial;letter-spacing:2px;color:#007a5e">BIOPULSE</div>
<div style="font-size:13px;color:#51657a;margin-top:4px">${esc(mode === 'test' ? 'Test digest' : 'Weekly account signals')}${esc(firm)} · ${esc(date)}</div></td></tr>
<tr><td style="padding:16px 24px 4px;font-size:14px">${total} of your ${ws.accounts.length} accounts ${mode === 'test' ? 'have current signals' : 'have new signals since the last digest'}. Scores are heuristics; every signal links to its source.</td></tr>
${rows
  .map(
    (r) => `<tr><td style="padding:12px 24px;border-top:1px solid #eef2f5">
<div style="font-size:15px;font-weight:700"><a href="${esc(wsLink(r.id))}" style="color:#13202e;text-decoration:none">${esc(r.name)}</a>
<span style="font:700 11px Arial;color:${r.band === 'Hot' ? '#c0392b' : r.band === 'Warm' ? '#b7791f' : '#51657a'};margin-left:6px">${esc(r.band.toUpperCase())} ${r.score}</span></div>
${r.fresh
  .map(
    (s) => `<div style="font-size:13px;margin-top:6px;line-height:1.45"><span style="font:700 10px Arial;color:#2b6cb0;text-transform:uppercase">${esc(s.label)}</span><br/>
<a href="${esc(safe(s.url))}" style="color:#13202e">${esc(s.title)}</a> <span style="color:#7a8b9c">· ${esc(s.source)}</span></div>`,
  )
  .join('')}
<div style="margin-top:8px"><a href="${esc(wsLink(r.id))}" style="font-size:12px;color:#007a5e">Open account and draft outreach →</a></div></td></tr>`,
  )
  .join('')}
<tr><td style="padding:16px 24px 20px;border-top:1px solid #dfe5eb;font-size:11px;color:#7a8b9c;line-height:1.5">
<a href="${esc(wsLink())}" style="color:#007a5e">Open BioPulse</a> · <a href="${esc(unsub)}" style="color:#7a8b9c">Unsubscribe</a><br/>
Sent because this address was added to a BioPulse workspace. No tracking pixels or click tracking.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `BIOPULSE · ${mode === 'test' ? 'Test digest' : 'Weekly account signals'}${firm} · ${date}`,
    '',
    `${total} of your ${ws.accounts.length} accounts have ${mode === 'test' ? 'current' : 'new'} signals.`,
    '',
    ...rows.flatMap((r) => [
      `${r.name} (${r.band} ${r.score})`,
      ...r.fresh.map((s) => `  - ${s.label}: ${s.title} (${s.source}) ${s.url}`),
      `  Open: ${wsLink(r.id)}`,
      '',
    ]),
    `Unsubscribe: ${unsub}`,
  ].join('\n');

  return { subject, html, text, unsubscribeUrl: unsub };
}

export async function sendEmail({ to, subject, html, text, unsubscribeUrl }) {
  if (!emailConfigured()) {
    const e = new Error('Email is not configured. Add RESEND_API_KEY in Netlify.');
    e.status = 503;
    e.code = 'email_not_configured';
    throw e;
  }
  const r = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    timeoutMs: 8000,
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      html,
      text,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  let d = null;
  try {
    d = await r.json();
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const e = new Error(d?.message || `Resend HTTP ${r.status}`);
    e.status = r.status === 401 || r.status === 403 ? 500 : 502;
    e.code = r.status === 401 || r.status === 403 ? 'email_rejected' : 'email_failed';
    throw e;
  }
  return { id: d?.id || null };
}
