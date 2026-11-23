// Backend client.
import { local } from './util.js';

export const isGithubPages = /\.github\.io$/i.test(location.hostname);
export const apiBase = () => (local.get('bp:apiBase') || (window.BIOPULSE_CONFIG && window.BIOPULSE_CONFIG.apiBase) || '').trim().replace(/\/+$/, '');
export const backendMissing = () => isGithubPages && !apiBase();

export class ApiError extends Error {
  constructor(msg, status, code, data) {
    super(msg);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, timeout = 20000, cacheKey } = {}) {
  if (backendMissing()) throw new ApiError('Backend not connected', 0, 'no_backend');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(apiBase() + path, {
      method,
      signal: ctrl.signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await r.json();
    } catch {
      /* non-JSON */
    }
    if (!r.ok) throw new ApiError((data && data.error) || `Request failed (${r.status})`, r.status, data && data.code, data);
    if (!data) throw new ApiError('Empty response from server', r.status);
    if (cacheKey) local.set('bp:cache:' + cacheKey, { at: Date.now(), data });
    return { data, from: 'live' };
  } catch (e) {
    const err =
      e.name === 'AbortError'
        ? new ApiError('The request timed out', 0, 'timeout')
        : e instanceof ApiError
          ? e
          : new ApiError('Network error: ' + e.message, 0, 'network');
    if (cacheKey && method === 'GET') {
      const c = local.get('bp:cache:' + cacheKey);
      if (c && c.data) return { data: c.data, from: 'offline', at: c.at, error: err.message };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
