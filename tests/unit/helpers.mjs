// Test helpers: a fetch router so functions can be tested without network.
process.env.BIOPULSE_DISABLE_BLOBS = '1';

export function mockFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, opts });
    for (const [match, handler] of routes) {
      if (typeof match === 'string' ? u.includes(match) : match.test(u)) {
        const res = await handler(u, opts);
        if (res instanceof Response) return res;
        const { status = 200, body = '', json, headers = {} } = res;
        return new Response(json !== undefined ? JSON.stringify(json) : body, {
          status,
          headers: { 'Content-Type': json !== undefined ? 'application/json' : 'text/xml', ...headers },
        });
      }
    }
    return new Response('not mocked: ' + u, { status: 599 });
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

export function req(url, { method = 'GET', origin, body, headers = {} } = {}) {
  const h = new Headers(headers);
  if (origin) h.set('origin', origin);
  if (body !== undefined) h.set('content-type', 'application/json');
  return new Request(url, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}

export const RSS = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items
  .map(
    (i) => `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link><pubDate>${i.date || new Date().toUTCString()}</pubDate><description><![CDATA[${i.desc || ''}]]></description></item>`,
  )
  .join('')}</channel></rss>`;
