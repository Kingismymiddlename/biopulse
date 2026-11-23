import { json, preflight, corsHeaders, originAllowed } from '../lib/http.mjs';
import { rateLimit } from '../lib/store.mjs';
import { loadWorkspace, ID_RE } from '../lib/workspace.mjs';
import { selectDigest, renderDigest, sendEmail, maskEmail } from '../lib/digest.mjs';
import { scoreAccounts } from './signals.mjs';
import { mapLimit } from '../lib/http.mjs';

export async function scoreWorkspace(ws, now = new Date()) {
  const chunks = [];
  for (let i = 0; i < ws.accounts.length; i += 10) chunks.push(ws.accounts.slice(i, i + 10));
  const parts = await mapLimit(chunks, 2, (c) => scoreAccounts(c, now));
  return parts.flatMap((p) => (p && p.results) || []);
}

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  const cors = corsHeaders(req);
  const reply = (data, status = 200) => json(data, { status, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  if (!originAllowed(req)) return reply({ error: 'Origin not allowed.' }, 403);
  let b;
  try {
    b = JSON.parse((await req.text()) || '{}');
  } catch {
    return reply({ error: 'Invalid JSON.' }, 400);
  }
  if (!ID_RE.test(b.id || '')) return reply({ error: 'Invalid workspace link.' }, 400);
  const ws = await loadWorkspace(b.id);
  if (!ws) return reply({ error: "This workspace doesn't exist." }, 404);
  if (!ws.digest?.email) return reply({ error: 'Add a digest email in Settings first.', code: 'no_email' }, 400);
  if (!ws.accounts.length) return reply({ error: 'Add some accounts first.', code: 'no_accounts' }, 400);
  const lim = await rateLimit('digest-test:' + ws.id, 3, 3600);
  if (!lim.ok) return reply({ error: 'Test digest limit reached (3 per hour).', code: 'limit' }, 429);
  try {
    const results = await scoreWorkspace(ws);
    const { rows } = selectDigest(ws, results, { mode: 'test' });
    if (!rows.length) return reply({ sent: false, message: 'None of your accounts has a signal right now, so there was nothing to send.' });
    const mail = renderDigest(ws, rows, { mode: 'test' });
    await sendEmail({ to: ws.digest.email, ...mail });
    return reply({ sent: true, to: maskEmail(ws.digest.email), accounts: rows.length });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('[digest]', e.code || '', e.message);
    return reply({ error: e.message, code: e.code }, e.status || 500);
  }
};

export const config = { path: '/api/digest' };
