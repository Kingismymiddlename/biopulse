import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyBrief, buildProspect, buildEventFit, normDailyBrief, normProspect, normEventFit, clean } from '../../netlify/lib/prompts.mjs';

const H = (n) => Array.from({ length: n }, (_, i) => ({ title: `Headline ${i + 1}`, source: 'STAT', tag: 'NEWS' }));

test('daily brief needs at least 3 headlines and caps at 30', () => {
  assert.ok(buildDailyBrief({ headlines: H(2) }).error);
  const p = buildDailyBrief({ headlines: H(50), watchlist: ['Pfizer'] });
  assert.equal(p.count, 30);
  assert.ok(p.user.includes('[30] (STAT, NEWS) Headline 30'));
  assert.ok(!p.user.includes('Headline 31'));
  assert.ok(p.system.includes('untrusted'));
});

test('user text is cleaned: control chars removed, length capped', () => {
  assert.equal(clean('a\u0000b\u0007c  d', 100), 'a b c d');
  const p = buildDailyBrief({ headlines: H(3), profile: { firm: 'x'.repeat(500) } });
  assert.ok(p.user.includes('Firm: ' + 'x'.repeat(80) + '\n'));
});

test('prospect and event prompts validate required fields', () => {
  assert.ok(buildProspect({}).error);
  assert.ok(buildEventFit({ event: {} }).error);
  const p = buildProspect({ company: 'Novo Nordisk', data: { trials: { activeTotal: 121, phases: { PHASE3: 48 } } } });
  assert.ok(p.user.includes('Active trials as lead sponsor (recruiting, not yet recruiting, active): 121'));
  assert.ok(p.user.includes('PHASE3: 48'));
  const e = buildEventFit({ event: { name: 'ASCO', focus: ['Oncology'] } });
  assert.ok(e.user.includes('Focus: Oncology'));
  assert.ok(e.user.includes('Do NOT name specific sponsors'));
});

test('normalisers drop out-of-range citations and bad shapes', () => {
  const d = normDailyBrief({
    lead: 'L',
    themes: [{ title: 'T', summary: 'S', sources: [1, 99, '2', 2] }],
    watchlist: [{ company: 'Pfizer', note: 'n', sources: [] }],
    opportunities: 'nope',
  }, 5);
  assert.deepEqual(d.themes[0].sources, [1, 2]);
  assert.equal(d.watchlist.length, 0); // uncited watchlist items are dropped
  assert.deepEqual(d.opportunities, []);

  const p = normProspect({ confidence: 'VERY', angle: null, news: [{ text: 'x', sources: [3] }] }, 2);
  assert.equal(p.confidence, 'low');
  assert.equal(p.news.length, 0);
  assert.deepEqual(p.angle.hooks, []);

  assert.equal(normEventFit({ verdict: 'maybe', score: 82 }).verdict, 'go');
  assert.equal(normEventFit({ verdict: 'skip', score: 500 }).score, 100);
});
