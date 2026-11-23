import { json, preflight, corsHeaders } from '../lib/http.mjs';
import { recentApprovals } from '../lib/sources.mjs';
import { cached } from '../lib/store.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req, { publicData: true });
  const cors = corsHeaders(req, { publicData: true });
  try {
    const data = await cached('fda:approvals:v1', 3 * 3600, async () => ({
      fetchedAt: new Date().toISOString(),
      source: 'openFDA Drugs@FDA',
      ...(await recentApprovals(60)),
    }));
    return json(data, { cdnSeconds: 3 * 3600, swrSeconds: 12 * 3600, browserSeconds: 600, headers: cors });
  } catch (e) {
    console.error('[fda]', e.message);
    return json({ error: 'openFDA is unavailable right now.' }, { status: 502, headers: cors });
  }
};

export const config = { path: '/api/fda' };
