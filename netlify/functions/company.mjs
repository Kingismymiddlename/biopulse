import { json, preflight, corsHeaders } from '../lib/http.mjs';
import { sponsorTrials, sponsorApprovals } from '../lib/sources.mjs';
import { cached } from '../lib/store.mjs';
import { clean } from '../lib/prompts.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req, { publicData: true });
  const cors = corsHeaders(req, { publicData: true });
  const name = clean(new URL(req.url).searchParams.get('name'), 80);
  if (name.length < 2) return json({ error: 'Add a company name.' }, { status: 400, headers: cors });
  const key = 'company:' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  try {
    const data = await cached(key, 12 * 3600, async () => {
      const [trials, fda] = await Promise.allSettled([sponsorTrials(name), sponsorApprovals(name)]);
      if (trials.status === 'rejected' && fda.status === 'rejected') throw new Error('Registries unavailable');
      return {
        company: name,
        fetchedAt: new Date().toISOString(),
        trials: trials.status === 'fulfilled' ? trials.value : { error: 'ClinicalTrials.gov unavailable' },
        fda: fda.status === 'fulfilled' ? fda.value : { error: 'openFDA unavailable' },
      };
    });
    return json(data, { cdnSeconds: 6 * 3600, swrSeconds: 24 * 3600, browserSeconds: 300, headers: cors });
  } catch (e) {
    console.error('[company]', e.message);
    return json({ error: 'Registry lookups are unavailable right now.' }, { status: 502, headers: cors });
  }
};

export const config = { path: '/api/company' };
