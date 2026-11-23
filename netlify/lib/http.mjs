// Shared HTTP helpers for BioPulse functions.

const DEFAULT_ALLOWED = [
  'https://kingismymiddlename.github.io',
  'http://localhost:8888',
  'http://localhost:3000',
  'http://127.0.0.1:8888',
];

export function allowedOrigins() {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const site = (process.env.URL || '').replace(/\/$/, '');
  const deploy = (process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
  return new Set([...DEFAULT_ALLOWED, ...extra, site, deploy].filter(Boolean));
}

/** True when the request comes from this site or an allow-listed origin. */
export function originAllowed(req) {
  const origin = req.headers.get('origin');
  if (!origin) {
    // Same-origin GETs may omit Origin; POSTs from browsers always send it.
    return req.method === 'GET';
  }
  const o = origin.replace(/\/$/, '');
  if (allowedOrigins().has(o)) return true;
  // Netlify deploy previews: https://<hash>--<site>.netlify.app
  try {
    const host = new URL(o).host;
    const site = process.env.URL ? new URL(process.env.URL).host : '';
    if (site && host.endsWith('--' + site)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function corsHeaders(req, { publicData = false } = {}) {
  if (publicData) {
    return { 'Access-Control-Allow-Origin': '*' };
  }
  const origin = req.headers.get('origin');
  if (origin && originAllowed(req)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
  }
  return { Vary: 'Origin' };
}

/**
 * JSON response with optional CDN caching.
 * cdnSeconds: how long Netlify's CDN may serve it; swrSeconds: stale-while-revalidate window.
 */
export function json(data, { status = 200, cdnSeconds = 0, swrSeconds = 0, browserSeconds = 0, headers = {} } = {}) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  };
  if (cdnSeconds > 0 && status === 200) {
    h['Cache-Control'] = `public, max-age=${browserSeconds}`;
    h['Netlify-CDN-Cache-Control'] =
      `public, durable, s-maxage=${cdnSeconds}` + (swrSeconds ? `, stale-while-revalidate=${swrSeconds}` : '');
    h['Netlify-Vary'] = 'query';
  } else {
    h['Cache-Control'] = 'no-store';
  }
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function preflight(req, opts) {
  return new Response(null, { status: 204, headers: corsHeaders(req, opts) });
}

export async function fetchWithTimeout(url, { timeoutMs = 8000, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'BioPulse/2.0 (+https://github.com/Kingismymiddlename/biopulse)',
        ...(opts.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJSON(url, opts) {
  const r = await fetchWithTimeout(url, opts);
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status} from ${new URL(url).host}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

/** Run async tasks with a concurrency cap. Returns results in input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        out[idx] = { error: e.message || String(e) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export function clientIp(req, context) {
  return (
    context?.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}
