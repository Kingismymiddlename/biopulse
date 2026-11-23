import { json, preflight, corsHeaders, originAllowed, clientIp } from '../lib/http.mjs';
import { rateLimit } from '../lib/store.mjs';
import { normWorkspace, publicView, loadWorkspace, saveWorkspace, deleteWorkspace, newId, ID_RE, MAX_BYTES } from '../lib/workspace.mjs';

async function body(req) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES + 4096) {
    const e = new Error('Request too large.');
    e.status = 413;
    throw e;
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    const e = new Error('Invalid JSON.');
    e.status = 400;
    throw e;
  }
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return preflight(req);
  const cors = corsHeaders(req);
  const reply = (data, status = 200) => json(data, { status, headers: cors });
  if (!originAllowed(req)) return reply({ error: 'Origin not allowed.' }, 403);
  const id = new URL(req.url).searchParams.get('id');

  try {
    if (req.method === 'POST') {
      const ip = clientIp(req, context);
      const lim = await rateLimit('wscreate:' + ip, Number(process.env.WORKSPACE_CREATE_LIMIT) || 5, 3600);
      if (!lim.ok) return reply({ error: 'Too many workspaces created from this connection. Try again in an hour.', code: 'limit' }, 429);
      const b = await body(req);
      const ws = normWorkspace({ ...(b.workspace || {}), id: newId() });
      await saveWorkspace(ws);
      return reply({ workspace: publicView(ws) }, 201);
    }

    if (!ID_RE.test(id || '')) return reply({ error: 'Invalid workspace link.', code: 'bad_id' }, 400);
    const prev = await loadWorkspace(id);
    if (!prev) return reply({ error: "This workspace doesn't exist or was deleted.", code: 'not_found' }, 404);

    if (req.method === 'GET') return reply({ workspace: publicView(prev) });

    if (req.method === 'PUT') {
      const b = await body(req);
      if (b.baseUpdatedAt && prev.updatedAt && Date.parse(prev.updatedAt) > Date.parse(b.baseUpdatedAt)) {
        return reply({ error: 'This workspace was changed on another device.', code: 'conflict', workspace: publicView(prev) }, 409);
      }
      const ws = normWorkspace({ ...(b.workspace || {}), id }, prev);
      await saveWorkspace(ws);
      return reply({ workspace: publicView(ws) });
    }

    if (req.method === 'DELETE') {
      await deleteWorkspace(id);
      return reply({ deleted: true });
    }
    return reply({ error: 'Method not allowed.' }, 405);
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('[workspace]', e.message);
    return reply({ error: e.message || 'Workspace error.' }, e.status || 500);
  }
};

export const config = { path: '/api/workspace' };
