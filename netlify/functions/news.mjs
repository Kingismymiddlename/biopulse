import { json, preflight, corsHeaders } from '../lib/http.mjs';
import { getNews } from '../lib/newsfeed.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req, { publicData: true });
  try {
    const data = await getNews();
    return json(data, { cdnSeconds: 600, swrSeconds: 1800, browserSeconds: 60, headers: corsHeaders(req, { publicData: true }) });
  } catch (e) {
    console.error('[news]', e.message);
    return json({ error: 'News feeds are unavailable right now.' }, { status: 502, headers: corsHeaders(req, { publicData: true }) });
  }
};

export const config = { path: '/api/news' };
