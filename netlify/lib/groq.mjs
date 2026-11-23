// Groq chat-completions client (OpenAI-compatible). The key never leaves the server.
import { fetchWithTimeout } from './http.mjs';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
export const FALLBACK_MODEL = 'openai/gpt-oss-20b';

export class AIError extends Error {
  constructor(message, status = 502, code = 'ai_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function aiConfigured() {
  return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
}

function models() {
  const primary = (process.env.GROQ_MODEL || DEFAULT_MODEL).trim();
  const fallback = (process.env.GROQ_FALLBACK_MODEL || FALLBACK_MODEL).trim();
  return primary === fallback ? [primary] : [primary, fallback];
}

async function once(model, { system, user, maxTokens, timeoutMs, jsonMode = true }) {
  const body = {
    model,
    temperature: 0.2,
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  if (model.startsWith('openai/gpt-oss')) {
    body.reasoning_effort = 'low';
    body.include_reasoning = false;
  }
  let r;
  try {
    r = await fetchWithTimeout(ENDPOINT, {
      method: 'POST',
      timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AIError(e.name === 'AbortError' ? 'The AI model took too long to respond.' : 'Could not reach Groq.', 504, 'ai_timeout');
  }
  let d = null;
  try {
    d = await r.json();
  } catch {
    /* non-JSON error body */
  }
  if (!r.ok) {
    const msg = d?.error?.message || `Groq HTTP ${r.status}`;
    if (r.status === 401) throw new AIError('The Groq API key was rejected. Check GROQ_API_KEY in Netlify.', 500, 'ai_bad_key');
    if (r.status === 429) throw new AIError('Groq rate limit reached. Try again in a minute.', 429, 'ai_rate_limited');
    if (r.status === 400 && /response_format|json/i.test(msg)) throw new AIError(msg, 400, 'ai_json_mode');
    if (r.status === 404 || /model/i.test(msg)) throw new AIError(msg, 404, 'ai_model');
    throw new AIError(msg, 502);
  }
  const content = d?.choices?.[0]?.message?.content;
  if (!content) throw new AIError('The AI model returned an empty answer.', 502, 'ai_empty');
  return { content, model, usage: d.usage || null };
}

/** Call Groq and parse a JSON object answer. Falls back to a second model if the first is unavailable. */
export async function generateJSON({ system, user, maxTokens = 1400, timeoutMs = 8500 }) {
  if (!aiConfigured()) {
    throw new AIError('AI is not configured. Add GROQ_API_KEY in Netlify site settings.', 503, 'ai_not_configured');
  }
  let lastErr;
  for (const model of models()) {
    try {
      let res;
      try {
        res = await once(model, { system, user, maxTokens, timeoutMs });
      } catch (e) {
        if (e.code !== 'ai_json_mode') throw e;
        res = await once(model, { system, user, maxTokens, timeoutMs, jsonMode: false });
      }
      return { data: parseJSONLoose(res.content), model: res.model, usage: res.usage };
    } catch (e) {
      lastErr = e;
      // Only fall back when the model itself is the problem or the output was unusable.
      if (!(e instanceof AIError) || !['ai_model', 'ai_empty', 'ai_parse'].includes(e.code)) throw e;
    }
  }
  throw lastErr;
}

export function parseJSONLoose(raw) {
  let s = String(raw).replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) throw new AIError('The AI answer was not valid JSON.', 502, 'ai_parse');
  s = s.slice(a, b + 1);
  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      throw new AIError('The AI answer was not valid JSON.', 502, 'ai_parse');
    }
  }
}
