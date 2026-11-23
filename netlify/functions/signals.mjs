import { json, preflight, corsHeaders, originAllowed, clientIp, mapLimit } from '../lib/http.mjs';
import { cached, rateLimit } from '../lib/store.mjs';
import { getNews } from '../lib/newsfeed.mjs';
import { normAccount, slug } from '../lib/workspace.mjs';
import { fetchRegistry, buildAccountResult } from '../lib/signals.mjs';

export const MAX_PER_CALL = 10;

export async function scoreAccounts(accounts, now = new Date()) {
  let items = null;
  try {
    items = (await getNews()).items;
  } catch {
    items = null;
  }
  const results = await mapLimit(accounts, 5, async (acct) => {
    let reg = null;
    try {
      reg = await cached('reg:v1:' + slug(acct.registryName || acct.name), 12 * 3600, () => fetchRegistry(acct, now));
    } catch {
      reg = null;
    }
    return buildAccountResult(acct, items, reg, now.getTime());
  });
  return { results, newsOk: Array.isArray(items) };
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return preflight(req);
  const cors = corsHeaders(req);
  const reply = (data, status = 200) => json(data, { status, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  if (!originAllowed(req)) return reply({ error: 'Origin not allowed.' }, 403);
  const lim = await rateLimit('signals:' + clientIp(req, context), Number(process.env.SIGNALS_HOURLY_LIMIT) || 240, 3600);
  if (!lim.ok) return reply({ error: 'Too many scoring requests. Try again shortly.', code: 'limit' }, 429);
  let b;
  try {
    b = JSON.parse((await req.text()) || '{}');
  } catch {
    return reply({ error: 'Invalid JSON.' }, 400);
  }
  const accounts = (Array.isArray(b.accounts) ? b.accounts : []).map((a) => normAccount(a)).filter(Boolean);
  if (!accounts.length) return reply({ error: 'Send at least one account.' }, 400);
  if (accounts.length > MAX_PER_CALL) return reply({ error: `Send at most ${MAX_PER_CALL} accounts per call.` }, 400);
  try {
    const { results, newsOk } = await scoreAccounts(accounts);
    return reply({ generatedAt: new Date().toISOString(), newsOk, results });
  } catch (e) {
    console.error('[signals]', e.message);
    return reply({ error: 'Scoring failed. Try again.' }, 502);
  }
};

export const config = { path: '/api/signals' };
