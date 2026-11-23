import { json, preflight, corsHeaders, fetchWithTimeout } from '../lib/http.mjs';
import { FEEDS, parseFeed, classify, toDeal, mergeItems } from '../lib/news.mjs';
import { cached } from '../lib/store.mjs';

async function loadFeed(feed) {
  const started = Date.now();
  try {
    const r = await fetchWithTimeout(feed.url, {
      timeoutMs: 6000,
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const items = parseFeed(await r.text())
      .slice(0, 25)
      .map((it) => {
        const tag = classify(it.title, feed.kind);
        return { ...it, source: feed.name, sourceId: feed.id, tag };
      });
    return { feed, items, status: { id: feed.id, name: feed.name, ok: true, count: items.length, ms: Date.now() - started } };
  } catch (e) {
    return { feed, items: [], status: { id: feed.id, name: feed.name, ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message } };
  }
}

export async function buildNews() {
  const results = await Promise.all(FEEDS.map(loadFeed));
  const ok = results.filter((r) => r.status.ok);
  if (!ok.length) throw new Error('All news feeds failed');
  const cutoff = Date.now() - 14 * 86400000;
  const items = mergeItems(results.map((r) => r.items)).filter((it) => !it.date || Date.parse(it.date) >= cutoff).slice(0, 120);
  const dealCutoff = Date.now() - 7 * 86400000;
  const deals = items
    .map(toDeal)
    .filter((d) => d && (!d.date || Date.parse(d.date) >= dealCutoff))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 15);
  return { fetchedAt: new Date().toISOString(), items, deals, sources: results.map((r) => r.status) };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req, { publicData: true });
  try {
    const data = await cached('news:v1', 9 * 60, buildNews);
    return json(data, { cdnSeconds: 600, swrSeconds: 1800, browserSeconds: 60, headers: corsHeaders(req, { publicData: true }) });
  } catch (e) {
    console.error('[news]', e.message);
    return json({ error: 'News feeds are unavailable right now.' }, { status: 502, headers: corsHeaders(req, { publicData: true }) });
  }
};

export const config = { path: '/api/news' };
