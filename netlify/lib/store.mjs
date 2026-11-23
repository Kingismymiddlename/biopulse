// Durable cache + rate limiting on Netlify Blobs, with an in-memory fallback
// so the functions still work locally or if Blobs is unavailable.

const memory = new Map();
let blobsModule;

// Workspaces and rate limits must be read-your-writes (a save on one device is
// visible on the next, a delete is final at once); caches can lag.
const STRONG = new Set(['biopulse-workspaces', 'biopulse-limits']);

async function store(name) {
  if (process.env.BIOPULSE_DISABLE_BLOBS === '1') return null;
  try {
    if (blobsModule === undefined) {
      blobsModule = await import('@netlify/blobs');
    }
    return blobsModule.getStore({ name, consistency: STRONG.has(name) ? 'strong' : 'eventual' });
  } catch {
    blobsModule = null;
    return null;
  }
}

async function readJSON(storeName, key) {
  const s = await store(storeName);
  if (s) {
    try {
      return await s.get(key, { type: 'json' });
    } catch {
      /* fall through */
    }
  }
  return memory.get(storeName + ':' + key) ?? null;
}

async function writeJSON(storeName, key, value) {
  memory.set(storeName + ':' + key, value);
  const s = await store(storeName);
  if (s) {
    try {
      await s.setJSON(key, value);
    } catch {
      /* memory copy is enough */
    }
  }
}

/**
 * Return a fresh value if one is cached within ttlSeconds, otherwise compute it.
 * If computing fails, return the last good value marked stale, so panels keep
 * showing real (older) data instead of nothing.
 */
export async function cached(key, ttlSeconds, compute, { storeName = 'biopulse-cache' } = {}) {
  const hit = await readJSON(storeName, key);
  const now = Date.now();
  if (hit && now - hit.savedAt < ttlSeconds * 1000) {
    return { ...hit.value, cache: { hit: true, savedAt: hit.savedAt, stale: false } };
  }
  try {
    const value = await compute();
    await writeJSON(storeName, key, { savedAt: now, value });
    return { ...value, cache: { hit: false, savedAt: now, stale: false } };
  } catch (e) {
    if (hit) {
      return { ...hit.value, cache: { hit: true, savedAt: hit.savedAt, stale: true, error: e.message } };
    }
    throw e;
  }
}

/**
 * Fixed-window rate limiter. Returns { ok, remaining, resetAt }.
 * Blobs is eventually consistent, so this is a soft limit; it stops casual
 * abuse of the AI endpoint, which is what it is for.
 */
export async function rateLimit(bucket, limit, windowSeconds) {
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `${bucket}:${windowId}`.replace(/[^a-zA-Z0-9:._-]/g, '_');
  const current = (await readJSON('biopulse-limits', key)) || { n: 0 };
  const resetAt = (windowId + 1) * windowSeconds * 1000;
  if (current.n >= limit) return { ok: false, remaining: 0, resetAt };
  await writeJSON('biopulse-limits', key, { n: current.n + 1 });
  return { ok: true, remaining: limit - current.n - 1, resetAt };
}

export function _resetMemoryForTests() {
  memory.clear();
}

// ── Named-store primitives (workspaces) ─────────────────────────────────────
export async function getItem(storeName, key) {
  return readJSON(storeName, key);
}

export async function setItem(storeName, key, value) {
  return writeJSON(storeName, key, value);
}

export async function deleteItem(storeName, key) {
  memory.delete(storeName + ':' + key);
  const s = await store(storeName);
  if (s) {
    try {
      await s.delete(key);
    } catch {
      /* ignore */
    }
  }
}

export async function listKeys(storeName) {
  const s = await store(storeName);
  if (s) {
    try {
      const { blobs } = await s.list();
      return blobs.map((b) => b.key);
    } catch {
      /* fall through to memory */
    }
  }
  const prefix = storeName + ':';
  return [...memory.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
}
