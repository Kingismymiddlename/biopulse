import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, req, RSS } from './helpers.mjs';
import { _resetMemoryForTests } from '../../netlify/lib/store.mjs';
import ai from '../../netlify/functions/ai.mjs';
import news from '../../netlify/functions/news.mjs';
import quotes from '../../netlify/functions/quotes.mjs';
import company from '../../netlify/functions/company.mjs';
import health from '../../netlify/functions/health.mjs';

const ORIGIN = 'https://kingismymiddlename.github.io';
const brief = (headlines = 5) => ({
  task: 'dailyBrief',
  input: { headlines: Array.from({ length: headlines }, (_, i) => ({ title: 'H' + i + ' ' + Math.random(), source: 'STAT' })) },
});

test('ai: rejects unknown origins, bad JSON, unknown tasks and GET', async () => {
  let r = await ai(req('https://site/api/ai', { method: 'POST', origin: 'https://evil.example', body: brief() }), {});
  assert.equal(r.status, 403);
  r = await ai(req('https://site/api/ai', { method: 'POST', origin: ORIGIN, body: '{bad' }), {});
  assert.equal(r.status, 400);
  r = await ai(req('https://site/api/ai', { method: 'POST', origin: ORIGIN, body: { task: 'freeChat', input: {} } }), {});
  assert.equal(r.status, 400);
  r = await ai(req('https://site/api/ai', { method: 'GET', origin: ORIGIN }), {});
  assert.equal(r.status, 405);
  r = await ai(req('https://site/api/ai', { method: 'POST', origin: ORIGIN, body: 'x'.repeat(30000) }), {});
  assert.equal(r.status, 413);
});

test('ai: CORS preflight only for allowed origins', async () => {
  let r = await ai(req('https://site/api/ai', { method: 'OPTIONS', origin: ORIGIN }), {});
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  r = await ai(req('https://site/api/ai', { method: 'OPTIONS', origin: 'https://evil.example' }), {});
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('ai: 503 with clear code when key is missing', async () => {
  delete process.env.GROQ_API_KEY;
  _resetMemoryForTests();
  const r = await ai(req('https://site/api/ai', { method: 'POST', origin: ORIGIN, body: brief() }), { ip: '1.1.1.1' });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'ai_not_configured');
});

test('ai: generates, normalises, caches identical requests', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  _resetMemoryForTests();
  const content = JSON.stringify({ lead: 'Big day', themes: [{ title: 'T', summary: 'S', sources: [1, 42] }], watchlist: [], opportunities: [{ title: 'O', rationale: 'R', sources: [2] }] });
  const m = mockFetch([['api.groq.com', () => ({ json: { choices: [{ message: { content } }] } })]]);
  try {
    const body = brief();
    let r = await ai(req('https://site/api/ai', { method: 'POST', origin: ORIGIN, body }), { ip: '2.2.2.2' });
    assert.equal(r.status, 200);
    let d = await r.json();
    assert.equal(d.result.lead, 'Big day');
    assert.deepEqual(d.result.themes[0].sources, [1]);
    assert.equal(d.cached, false);
    r = await ai(req('https://site/api/ai', { method: 'POST', origin: ORIGIN, body }), { ip: '2.2.2.2' });
    d = await r.json();
    assert.equal(d.cached, true);
    assert.equal(m.calls.length, 1);
  } finally {
    m.restore();
  }
});

test('ai: per-IP hourly limit', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  process.env.AI_HOURLY_LIMIT_PER_IP = '2';
  _resetMemoryForTests();
  const m = mockFetch([['api.groq.com', () => ({ json: { choices: [{ message: { content: '{"lead":"x","themes":[],"watchlist":[],"opportunities":[]}' } }] } })]]);
  try {
    const codes = [];
    for (let i = 0; i < 3; i++) {
      const r = await ai(req('https://site/api/ai', { method: 'POST', origin: ORIGIN, body: brief() }), { ip: '3.3.3.3' });
      codes.push(r.status);
    }
    assert.deepEqual(codes, [200, 200, 429]);
  } finally {
    delete process.env.AI_HOURLY_LIMIT_PER_IP;
    m.restore();
  }
});

test('news: aggregates feeds, reports per-source status, extracts deals', async () => {
  _resetMemoryForTests();
  const now = new Date().toUTCString();
  const m = mockFetch([
    ['statnews.com', () => ({ body: RSS([{ title: 'Merck to acquire Verona for $10B', link: 'https://stat/1', date: now }]) })],
    ['fda.gov', () => ({ body: RSS([{ title: 'FDA Approves First Drug for X', link: 'https://fda/1', date: now }]) })],
    ['pharmavoice.com', () => ({ status: 403, body: 'blocked' })],
  ]);
  try {
    const r = await news(req('https://site/api/news'));
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('netlify-cdn-cache-control').includes('s-maxage=600'));
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    const d = await r.json();
    assert.equal(d.items.length, 2);
    assert.equal(d.deals[0].value, '$10B');
    const fierce = d.sources.find((s) => s.id === 'pharmavoice');
    assert.equal(fierce.ok, false);
    assert.equal(d.items.find((i) => i.sourceId === 'fda').tag, 'APPROVAL');
  } finally {
    m.restore();
  }
});

test('news: 502 when every feed fails and nothing is cached', async () => {
  _resetMemoryForTests();
  const m = mockFetch([]);
  try {
    const r = await news(req('https://site/api/news'));
    assert.equal(r.status, 502);
  } finally {
    m.restore();
  }
});

test('news: serves stale cached copy when feeds go down', async () => {
  _resetMemoryForTests();
  let up = true;
  const m = mockFetch([['statnews.com', () => (up ? { body: RSS([{ title: 'Story', link: 'https://s/1' }]) } : { status: 500, body: '' })]]);
  try {
    await news(req('https://site/api/news'));
    up = false;
    const realNow = Date.now;
    Date.now = () => realNow() + 60 * 60000; // an hour later: cache expired
    try {
      const r = await news(req('https://site/api/news'));
      const d = await r.json();
      assert.equal(r.status, 200);
      assert.equal(d.cache.stale, true);
      assert.equal(d.items[0].title, 'Story');
    } finally {
      Date.now = realNow;
    }
  } finally {
    m.restore();
  }
});

test('quotes: validates symbols', async () => {
  const r = await quotes(req('https://site/api/quotes?symbols=%3Cscript%3E,,'));
  assert.equal(r.status, 400);
});

test('company: requires a name and survives one registry failing', async () => {
  _resetMemoryForTests();
  let r = await company(req('https://site/api/company?name=a'));
  assert.equal(r.status, 400);
  const m = mockFetch([
    ['clinicaltrials.gov', () => ({ json: { totalCount: 3, studies: [{ protocolSection: { identificationModule: { nctId: 'NCT1', briefTitle: 'T' }, designModule: { phases: ['PHASE3'] }, conditionsModule: { conditions: ['Obesity'] }, sponsorCollaboratorsModule: { leadSponsor: { name: 'Novo Nordisk A/S' } } } }] } })],
    ['api.fda.gov', () => ({ status: 500, body: '' })],
  ]);
  try {
    r = await company(req('https://site/api/company?name=Novo%20Nordisk'));
    const d = await r.json();
    assert.equal(r.status, 200);
    assert.equal(d.trials.activeTotal, 3);
    assert.deepEqual(d.trials.phases, { PHASE3: 1 });
    assert.ok(d.fda.error);
  } finally {
    m.restore();
  }
});

test('health: reports AI configuration without leaking the key', async () => {
  process.env.GROQ_API_KEY = 'gsk_secret_value';
  const r = await health(req('https://site/api/health'));
  const text = await r.text();
  assert.ok(!text.includes('gsk_secret_value'));
  assert.equal(JSON.parse(text).ai.configured, true);
});
