import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { findAccount, classifySignal, acquisitionSide, newsSignals, registrySignals, scoreSignals, band, TYPES } from '../../netlify/lib/signals.mjs';

const A = (name, extra = {}) => ({ id: name.toLowerCase(), name, aliases: [], exclude: [], ...extra });
const NOW = Date.parse('2026-11-23T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();

test('whole-word matching, aliases and exclusions', () => {
  assert.ok(findAccount('Pfizer posts data', A('Pfizer')) === 0);
  assert.equal(findAccount('Pfizerish startup', A('Pfizer')), -1);
  const merck = A('Merck & Co.', { aliases: ['Merck', 'MSD'], exclude: ['Merck KGaA'] });
  assert.ok(findAccount('MSD and Isomorphic join forces', merck) >= 0);
  assert.equal(findAccount('Merck KGaA unveils new site', merck), -1);
  assert.ok(findAccount('Merck KGaA and Merck both report', merck) >= 0);
  const jj = A('Johnson & Johnson', { aliases: ['J&J'] });
  assert.ok(findAccount("J&J's $2.2B Ollin buyout", jj) >= 0);
});

test('PRD worked examples: approval 41, approval + leadership 68', () => {
  const one = scoreSignals([{ id: 'a', type: 'fda_approval', date: day(0), confidence: 1 }], NOW);
  assert.equal(one.score, 41);
  const two = scoreSignals([{ id: 'a', type: 'fda_approval', date: day(0) }, { id: 'b', type: 'leadership', date: day(0) }], NOW);
  assert.equal(two.score, 68);
  assert.equal(two.band, 'Hot');
});

test('decay halves every 14 days; repeats of a type halve; confidence applies', () => {
  const r = scoreSignals([{ id: 'a', type: 'financing', date: day(14) }], NOW);
  assert.equal(r.signals[0].points, 4); // 8 * 0.5
  const rep = scoreSignals([{ id: 'a', type: 'financing', date: day(0) }, { id: 'b', type: 'financing', date: day(0) }], NOW);
  assert.deepEqual(rep.signals.map((s) => s.points), [8, 4]);
  const low = scoreSignals([{ id: 'a', type: 'mention', date: day(0), confidence: 0.6 }], NOW);
  assert.equal(low.signals[0].points, 0.6);
  assert.equal(scoreSignals([], NOW).band, 'Quiet');
  assert.equal(band(30), 'Warm');
  assert.equal(band(29), 'Cool');
});

test('classification of real headlines from the 23 Nov 2026 feed', () => {
  const sanofi = A('Sanofi');
  const insmed = A('Insmed');
  const t1 = 'StockWatch: Insmed Jumps on Report of Takeover Interest by Sanofi, as Analysts Conclude a Deal Would Make Sense';
  assert.equal(classifySignal(t1, sanofi, findAccount(t1, sanofi)), 'acquirer');
  assert.equal(classifySignal(t1, insmed, findAccount(t1, insmed)), 'acquired');
  const t2 = 'Sanofi rumoured to be eyeing high-profile Insmed takeover';
  assert.equal(classifySignal(t2, sanofi, findAccount(t2, sanofi)), 'acquirer');
  assert.equal(classifySignal(t2, insmed, findAccount(t2, insmed)), 'acquired');
  const merck = A('Merck & Co.', { aliases: ['Merck', 'MSD'] });
  const t3 = 'Isomorphic Labs adds Merck as an oncology partner after $5 billion raise';
  assert.equal(classifySignal(t3, merck, findAccount(t3, merck)), 'partnership');
  const iso = A('Isomorphic Labs');
  assert.equal(classifySignal(t3, iso, findAccount(t3, iso)), 'financing');
  const cap = A('Capricor Therapeutics', { aliases: ['Capricor'] });
  const t4 = 'FDA again turns back Capricor Duchenne cell therapy';
  assert.equal(classifySignal(t4, cap, findAccount(t4, cap)), 'fda_rejection');
  const t5 = 'Sanofi gains FDA clearance for Gaucher disease pill';
  assert.equal(classifySignal(t5, sanofi, findAccount(t5, sanofi)), 'fda_approval');
});

test('leadership, restructuring, AI and passive acquisitions', () => {
  const x = A('Acme Bio');
  assert.equal(classifySignal('Acme Bio names former Roche exec as chief data officer', x, 0), 'leadership');
  assert.equal(classifySignal('Acme Bio CEO steps down after trial miss', x, 0), 'leadership');
  assert.equal(classifySignal('Acme Bio lays off 20% of staff', x, 0), 'restructuring');
  assert.equal(classifySignal('Acme Bio bets on generative AI for trial design', x, 0), 'ai_initiative');
  assert.equal(acquisitionSide('Acme Bio to be acquired by Big Pharma for $1B', x, 0), 'acquired');
  assert.equal(acquisitionSide('Big Pharma acquires Acme Bio', x, 18), 'acquired');
  assert.equal(acquisitionSide('Acme Bio acquires Tiny Co', x, 0), 'acquirer');
});

test('summary-only matches and roundups become context, not triggers', () => {
  const acct = A('Pfizer');
  const items = [
    { title: 'Big merger announced', summary: 'Pfizer was not involved', link: 'https://x/1', date: day(1), source: 'S' },
    { title: "Pharmalittle: We're reading about Pfizer layoffs and more", summary: '', link: 'https://x/2', date: day(1), source: 'STAT' },
    { title: 'Pfizer lays off 500', summary: '', link: 'https://x/3', date: day(1), source: 'F' },
    { title: 'Old Pfizer news', summary: '', link: 'https://x/4', date: day(20), source: 'F' },
  ];
  const sigs = newsSignals(acct, items, NOW);
  assert.deepEqual(sigs.map((s) => [s.type, s.confidence]), [['mention', 0.6], ['mention', 0.6], ['restructuring', 1]]);
});

test('registry signals use the sponsor baseline', () => {
  const reg = (total, trials, base) => ({ trials: { since: '2026-10-24', total, trials, baseline: base } });
  const p3 = (n) => Array.from({ length: n }, (_, i) => ({ nct: 'NCT' + i, title: 'T' + i, phases: ['PHASE3'], posted: '2026-11-20' }));
  // Small biotech, first Phase 3: signal.
  let s = registrySignals(reg(1, p3(1), { perMonth: 0.3, phase3PerMonth: 0 }));
  assert.deepEqual(s.map((x) => x.type), ['new_phase3']);
  // Big sponsor at its usual pace: no signal.
  s = registrySignals(reg(12, p3(3), { perMonth: 11, phase3PerMonth: 3.3 }));
  assert.deepEqual(s, []);
  // Big sponsor surging: both.
  s = registrySignals(reg(30, p3(8), { perMonth: 10, phase3PerMonth: 3 }));
  assert.deepEqual(s.map((x) => x.type).sort(), ['new_phase3', 'trial_surge']);
  assert.equal(s.find((x) => x.type === 'new_phase3').extraWeight, 3);
  // FDA originals become approval signals.
  s = registrySignals({ fda: { originals: [{ application: 'NDA1', date: '2026-11-18', brand: 'LIVSAYIS', ingredient: 'CEMDISIRAN', type: 'Type 1 - New Molecular Entity', url: 'https://fda/x' }] } });
  assert.equal(s[0].type, 'fda_approval');
  assert.match(s[0].title, /LIVSAYIS \(cemdisiran\), new molecular entity/);
});

test('derived short names match proper nouns only', async () => {
  const { shortName } = await import('../../netlify/lib/signals.mjs');
  assert.equal(shortName('Capricor Therapeutics'), 'Capricor');
  assert.equal(shortName('Sarepta Therapeutics, Inc.'.replace(',', '')), 'Sarepta');
  assert.equal(shortName('Beam Therapeutics'), null); // too short and a common word
  assert.equal(shortName('Pfizer'), null);
  assert.equal(shortName('Structure Therapeutics'), 'Structure');
  const cap = A('Capricor Therapeutics');
  assert.ok(findAccount('FDA again turns back Capricor Duchenne cell therapy', cap) >= 0);
  const st = A('Structure Therapeutics');
  assert.equal(findAccount('the structure of the deal', st), -1); // case-sensitive
  assert.ok(findAccount('Structure jumps on obesity data', st) >= 0);
});

test('every type has a label, weight and reason', () => {
  for (const [k, t] of Object.entries(TYPES)) assert.ok(t.label && t.weight > 0 && t.why, k);
});
