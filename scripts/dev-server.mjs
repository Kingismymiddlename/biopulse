// Minimal local server: serves the static site and runs the Netlify function
// handlers for /api/*. No Netlify CLI needed.
// Usage: GROQ_API_KEY=gsk_... node scripts/dev-server.mjs   → http://localhost:8888
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.BIOPULSE_DISABLE_BLOBS ??= '1';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8888;
const ROUTES = {};
for (const name of ['ai', 'news', 'trials', 'fda', 'quotes', 'company', 'health']) {
  ROUTES['/api/' + name] = (await import(`../netlify/functions/${name}.mjs`)).default;
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const fn = ROUTES[url.pathname];
  if (fn) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const out = await fn(request, { ip: req.socket.remoteAddress });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
    return;
  }
  const path = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT) || /[\\/](netlify|tests|node_modules|\.git)[\\/]/.test(path.slice(ROOT.length - 1))) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`BioPulse dev server on http://localhost:${PORT}${process.env.GROQ_API_KEY ? '' : '  (AI disabled: set GROQ_API_KEY)'}`));
