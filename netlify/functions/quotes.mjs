import { json, preflight, corsHeaders, mapLimit } from '../lib/http.mjs';
import { quote, SYMBOL_RE } from '../lib/sources.mjs';
import { cached } from '../lib/store.mjs';

const DEFAULT = ['XBI', 'IBB', '^NBI', 'LLY', 'NVO', 'MRK', 'PFE', 'AZN', 'VRTX', 'REGN', 'MRNA', 'GILD'];

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req, { publicData: true });
  const cors = corsHeaders(req, { publicData: true });
  const param = new URL(req.url).searchParams.get('symbols');
  const symbols = param
    ? [...new Set(param.toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)))].slice(0, 16)
    : DEFAULT;
  if (!symbols.length) return json({ error: 'No valid symbols.' }, { status: 400, headers: cors });
  const key = 'quotes:' + [...symbols].sort().join(',');
  try {
    const data = await cached(key, 4 * 60, async () => {
      const quotes = await mapLimit(symbols, 6, quote);
      if (!quotes.some((q) => typeof q.price === 'number')) throw new Error('No quotes available');
      return { fetchedAt: new Date().toISOString(), quotes, note: 'Delayed quotes. Not investment advice.' };
    });
    return json(data, { cdnSeconds: 300, swrSeconds: 900, browserSeconds: 60, headers: cors });
  } catch (e) {
    console.error('[quotes]', e.message);
    return json({ error: 'Market quotes are unavailable right now.' }, { status: 502, headers: cors });
  }
};

export const config = { path: '/api/quotes' };
