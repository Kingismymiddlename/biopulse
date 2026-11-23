import { json, preflight, corsHeaders } from '../lib/http.mjs';
import { trialAreas, trialCountries } from '../lib/sources.mjs';
import { cached } from '../lib/store.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req, { publicData: true });
  const cors = corsHeaders(req, { publicData: true });
  const view = new URL(req.url).searchParams.get('view') === 'countries' ? 'countries' : 'areas';
  try {
    const data = await cached('trials:' + view + ':v1', 6 * 3600, async () => ({
      fetchedAt: new Date().toISOString(),
      source: 'ClinicalTrials.gov API v2',
      ...(view === 'countries' ? await trialCountries() : await trialAreas()),
    }));
    return json(data, { cdnSeconds: 3 * 3600, swrSeconds: 12 * 3600, browserSeconds: 600, headers: cors });
  } catch (e) {
    console.error('[trials]', view, e.message);
    return json({ error: 'ClinicalTrials.gov is unavailable right now.' }, { status: 502, headers: cors });
  }
};

export const config = { path: '/api/trials' };
