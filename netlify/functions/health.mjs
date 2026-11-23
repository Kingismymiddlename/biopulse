import { json, preflight, corsHeaders } from '../lib/http.mjs';
import { aiConfigured, DEFAULT_MODEL } from '../lib/groq.mjs';
import { emailConfigured, fromAddress } from '../lib/digest.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight(req, { publicData: true });
  return json(
    {
      ok: true,
      version: '3.0.0',
      ai: { configured: aiConfigured(), model: process.env.GROQ_MODEL || DEFAULT_MODEL },
      email: { configured: emailConfigured(), testSender: fromAddress().includes('resend.dev') },
      openfdaKey: Boolean(process.env.OPENFDA_API_KEY),
      time: new Date().toISOString(),
    },
    { headers: corsHeaders(req, { publicData: true }) },
  );
};

export const config = { path: '/api/health' };
