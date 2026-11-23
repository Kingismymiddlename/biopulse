import { createHash } from 'node:crypto';
import { json, preflight, corsHeaders, originAllowed, clientIp } from '../lib/http.mjs';
import { generateJSON, AIError } from '../lib/groq.mjs';
import { cached, rateLimit } from '../lib/store.mjs';
import {
  buildDailyBrief, buildProspect, buildEventFit,
  normDailyBrief, normProspect, normEventFit,
} from '../lib/prompts.mjs';

const TASKS = {
  dailyBrief: { build: buildDailyBrief, norm: normDailyBrief, ttl: 30 * 60 },
  prospect: { build: buildProspect, norm: normProspect, ttl: 6 * 3600 },
  eventFit: { build: buildEventFit, norm: normEventFit, ttl: 7 * 86400 },
};

const MAX_BODY = 24 * 1024;

export default async (req, context) => {
  if (req.method === 'OPTIONS') return preflight(req);
  const cors = corsHeaders(req);
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, { status: 405, headers: cors });
  if (!originAllowed(req)) return json({ error: 'Origin not allowed.' }, { status: 403, headers: cors });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'Request too large.' }, { status: 413, headers: cors });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON.' }, { status: 400, headers: cors });
  }
  const task = TASKS[body?.task];
  if (!task) return json({ error: 'Unknown task.' }, { status: 400, headers: cors });

  const prompt = task.build(body.input || {});
  if (prompt.error) return json({ error: prompt.error }, { status: 400, headers: cors });

  const key = 'ai:' + body.task + ':' + createHash('sha256').update(prompt.system + '\n' + prompt.user).digest('hex').slice(0, 40);

  try {
    let fresh = false;
    const result = await cached(key, task.ttl, async () => {
      // Only count calls that actually hit Groq against the limits.
      const ip = clientIp(req, context);
      const perIp = await rateLimit('ip:' + ip, Number(process.env.AI_HOURLY_LIMIT_PER_IP) || 40, 3600);
      if (!perIp.ok) throw new AIError('You have hit the hourly AI limit. Try again later.', 429, 'limit_ip');
      const global = await rateLimit('global', Number(process.env.AI_DAILY_LIMIT) || 800, 86400);
      if (!global.ok) throw new AIError('Daily AI budget for this site is used up. It resets at 00:00 UTC.', 429, 'limit_global');
      fresh = true;
      const out = await generateJSON(prompt);
      return { result: task.norm(out.data, prompt.count || 0), model: out.model, generatedAt: new Date().toISOString() };
    });
    if (result.cache?.stale) {
      // Groq failed but we have an older identical answer: serve it, clearly flagged.
      return json({ ...result, stale: true }, { headers: cors });
    }
    return json({ ...result, cached: !fresh }, { headers: cors });
  } catch (e) {
    const status = e instanceof AIError ? e.status : 500;
    const code = e instanceof AIError ? e.code : 'server_error';
    if (status >= 500) console.error('[ai]', body.task, code, e.message);
    return json({ error: e.message || 'AI request failed.', code }, { status, headers: cors });
  }
};

export const config = { path: '/api/ai' };
