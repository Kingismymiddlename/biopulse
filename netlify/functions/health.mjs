import { json, preflight, corsHeaders } from '../lib/http.mjs';
import { aiConfigured, DEFAULT_MODEL } from '../lib/groq.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req, { publicData: true });
  return json(
    {
      ok: true,
      version: '2.0.0',
      ai: { configured: aiConfigured(), model: process.env.GROQ_MODEL || DEFAULT_MODEL },
      time: new Date().toISOString(),
    },
    { headers: corsHeaders(req, { publicData: true }) },
  );
};

export const config = { path: '/api/health' };
