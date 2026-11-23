import { loadWorkspace, saveWorkspace, tokenMatches, ID_RE } from '../lib/workspace.mjs';

const page = (title, body, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title} · BioPulse</title><style>body{background:#07090f;color:#d3e2f0;font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}main{max-width:440px}h1{font-size:18px;color:#00e5b0}a{color:#00e5b0}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );

export default async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get('id');
  const t = u.searchParams.get('t');
  if (!ID_RE.test(id || '') || !t) return page('Link not valid', 'This unsubscribe link is incomplete.', 400);
  const ws = await loadWorkspace(id);
  if (!ws || !tokenMatches(ws, t)) return page('Link not valid', 'This unsubscribe link has expired or the workspace was deleted.', 404);
  if (ws.digest.enabled) {
    ws.digest.enabled = false;
    ws.updatedAt = new Date().toISOString();
    await saveWorkspace(ws);
  }
  return page('Unsubscribed', 'You will not get the BioPulse weekly digest any more. You can turn it back on in Settings at any time.');
};

export const config = { path: '/api/unsubscribe' };
