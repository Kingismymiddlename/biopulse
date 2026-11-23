import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, classify, extractMoney, toDeal, mergeItems, cleanText, safeUrl } from '../../netlify/lib/news.mjs';
import { RSS } from './helpers.mjs';

test('parses RSS 2.0 with CDATA, entities and HTML', () => {
  const xml = RSS([{ title: 'Lilly &amp; Novo <b>clash</b> on GLP-1', link: 'https://x.com/a', desc: '<p>Body &#8217;s text</p>' }]);
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Lilly & Novo clash on GLP-1');
  assert.equal(items[0].summary, 'Body ’s text');
  assert.equal(items[0].link, 'https://x.com/a');
  assert.ok(items[0].date);
});

test('parses Atom feeds with link href', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom title</title><link rel="alternate" href="https://a.org/1"/><updated>2026-11-20T10:00:00Z</updated><summary>S</summary></entry></feed>`;
  const items = parseFeed(xml);
  assert.deepEqual(items.map((i) => [i.title, i.link, i.date]), [['Atom title', 'https://a.org/1', '2026-11-20T10:00:00.000Z']]);
});

test('drops items with unsafe or missing links', () => {
  const xml = RSS([{ title: 'Bad', link: 'javascript:alert(1)' }, { title: 'Good', link: 'https://ok.com' }]);
  assert.deepEqual(parseFeed(xml).map((i) => i.title), ['Good']);
  assert.equal(safeUrl('data:text/html,hi'), null);
});

test('cleanText strips scripts and truncates on word boundary', () => {
  assert.equal(cleanText('<script>alert(1)</script>Hello <i>world</i>'), 'Hello world');
  const t = cleanText('one two three four five six', 14);
  assert.ok(t.length <= 14 && t.endsWith('…'), t);
});

test('classify tags headlines with word boundaries', () => {
  assert.equal(classify('FDA approves first drug for Gaucher disease', 'regulator'), 'APPROVAL');
  assert.equal(classify('AbbVie to acquire ImmunoGen for $10.1B', 'news'), 'M&A');
  assert.equal(classify('Startup raises $80M Series B', 'news'), 'FINANCING');
  assert.equal(classify('Agency issues complete response letter to Sarepta', 'news'), 'CRL');
  assert.equal(classify('FDA again turns back Capricor Duchenne cell therapy', 'news'), 'CRL');
  assert.equal(classify('Company said the study continues', 'news'), 'NEWS'); // "said" must not match AI
  assert.equal(classify('New AI model for drug discovery', 'news'), 'AI');
});

test('extractMoney handles B/M, decimals and "up to"', () => {
  assert.deepEqual(extractMoney('Deal worth $2.4 billion'), { usd: 2.4e9, label: '$2.4B', upTo: false });
  assert.deepEqual(extractMoney('raises $150M in Series C'), { usd: 1.5e8, label: '$150M', upTo: false });
  assert.equal(extractMoney('pact worth up to $1.2B in milestones').upTo, true);
  assert.equal(extractMoney('No money here'), null);
});

test('toDeal requires a deal tag and a value', () => {
  assert.equal(toDeal({ tag: 'APPROVAL', title: 'FDA approves $5B drug' }), null);
  assert.equal(toDeal({ tag: 'M&A', title: 'X to acquire Y', summary: '' }), null);
  const d = toDeal({ tag: 'M&A', title: 'X to acquire Y for $3.1B', source: 'STAT', link: 'https://s', date: '2026-11-22T00:00:00Z' });
  assert.equal(d.value, '$3.1B');
  assert.equal(d.type, 'M&A');
});

test('mergeItems dedupes across feeds and sorts newest first', () => {
  const a = [{ title: 'Same story!', date: '2026-11-20T00:00:00Z' }];
  const b = [{ title: 'same story', date: '2026-11-21T00:00:00Z' }, { title: 'Newer', date: '2026-11-22T00:00:00Z' }];
  const out = mergeItems([a, b]);
  assert.deepEqual(out.map((i) => i.title), ['Newer', 'Same story!']);
});
