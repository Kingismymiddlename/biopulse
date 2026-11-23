import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch } from './helpers.mjs';
import { trialAreas, trialCountries, recentApprovals, sponsorTokens, sponsorApprovals, quote, SYMBOL_RE, AREAS } from '../../netlify/lib/sources.mjs';
import { mapLimit } from '../../netlify/lib/http.mjs';

test('mapLimit keeps order and captures errors', async () => {
  const out = await mapLimit([1, 2, 3], 2, async (x) => {
    if (x === 2) throw new Error('boom');
    return x * 10;
  });
  assert.deepEqual(out, [10, { error: 'boom' }, 30]);
});

test('trialAreas returns counts per area and flags partial data', async () => {
  let n = 0;
  const m = mockFetch([['clinicaltrials.gov', (u) => (++n === 3 ? { status: 503, body: 'x' } : { json: { totalCount: 100 } })]]);
  try {
    const r = await trialAreas(new Date('2026-11-23T00:00:00Z'));
    assert.equal(r.since, '2026-11-16');
    assert.equal(r.areas.length, AREAS.length);
    assert.equal(r.partial, true);
    assert.equal(r.total, 100);
    assert.ok(m.calls.some((c) => decodeURIComponent(c.url).includes('AREA[StudyFirstPostDate]RANGE[2026-11-16,MAX]')));
  } finally {
    m.restore();
  }
});

test('trialAreas throws when ClinicalTrials.gov is fully down', async () => {
  const m = mockFetch([['clinicaltrials.gov', () => ({ status: 500, body: '' })]]);
  try {
    await assert.rejects(trialAreas(), /unavailable/);
  } finally {
    m.restore();
  }
});

test('trialCountries maps ISO ids', async () => {
  const m = mockFetch([['clinicaltrials.gov', (u) => ({ json: { totalCount: u.includes('United+States') || u.includes('United%20States') ? 22000 : 5 } })]]);
  try {
    const r = await trialCountries();
    const us = r.countries.find((c) => c.id === '840');
    assert.equal(us.recruiting, 22000);
  } finally {
    m.restore();
  }
});

test('recentApprovals keeps only novel/biologic originals in range', async () => {
  const now = new Date('2026-11-23T00:00:00Z');
  const m = mockFetch([['api.fda.gov', () => ({
    json: {
      results: [
        { application_number: 'NDA221251', sponsor_name: 'REGENERON', products: [{ brand_name: 'LIVSAYIS', active_ingredients: [{ name: 'X' }] }], submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20261118', submission_class_code: 'TYPE 1', review_priority: 'PRIORITY' }] },
        { application_number: 'NDA217062', sponsor_name: 'AUSON', products: [{}], submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20261118', submission_class_code: 'TYPE 3' }] },
        { application_number: 'BLA761298', sponsor_name: 'AMGEN', products: [{ brand_name: 'PAVBLU' }], submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20261022', submission_class_code: 'UNKNOWN' }] },
        { application_number: 'NDA111', sponsor_name: 'OLD', products: [{}], submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20130715', submission_class_code: 'TYPE 1' }] },
      ],
    },
  })]]);
  try {
    const r = await recentApprovals(60, now);
    assert.deepEqual(r.approvals.map((a) => [a.brand, a.type, a.priority]), [['LIVSAYIS', 'New molecular entity', true], ['PAVBLU', 'Biologic (BLA)', false]]);
    assert.ok(r.approvals[0].url.includes('ApplNo=221251'));
  } finally {
    m.restore();
  }
});

test('sponsor tokens drop corporate suffixes; approvals filter on all tokens', async () => {
  assert.deepEqual(sponsorTokens('Eli Lilly and Company'), ['ELI', 'LILLY']);
  const m = mockFetch([['api.fda.gov', () => ({
    json: { results: [
      { sponsor_name: 'ELI LILLY AND CO', application_number: 'NDA1', products: [{ brand_name: 'A' }], submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20260601' }, { submission_type: 'SUPPL', submission_status: 'AP', submission_status_date: '20260701' }] },
      { sponsor_name: 'ELIXIR PHARMA', application_number: 'NDA2', products: [{}], submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20260601' }] },
    ] },
  })]]);
  try {
    const r = await sponsorApprovals('Eli Lilly', new Date('2026-11-23T00:00:00Z'));
    assert.deepEqual(r.matchedSponsors, ['ELI LILLY AND CO']);
    assert.equal(r.originals.length, 1);
    assert.equal(r.supplements, 1);
  } finally {
    m.restore();
  }
});

test('sponsorApprovals treats openFDA 404 as no results', async () => {
  const m = mockFetch([['api.fda.gov', () => ({ status: 404, json: { error: { code: 'NOT_FOUND' } } })]]);
  try {
    const r = await sponsorApprovals('Nobody Bio');
    assert.deepEqual(r.originals, []);
  } finally {
    m.restore();
  }
});

test('quote falls back from Yahoo to Stooq, then reports unavailable', async () => {
  let m = mockFetch([
    ['finance.yahoo.com', () => ({ status: 429, body: '' })],
    ['stooq.com', () => ({ body: 'Symbol,Date,Time,Open,High,Low,Close,Prev\nXBI.US,2026-11-20,22:00:00,1,1,1,101.5,100\n' })],
  ]);
  const q = await quote('XBI');
  assert.equal(q.source, 'Stooq');
  assert.equal(q.price, 101.5);
  assert.equal(Math.round(q.changePct * 10) / 10, 1.5);
  m.restore();
  m = mockFetch([]);
  const bad = await quote('XBI');
  assert.ok(bad.error);
  m.restore();
});

test('symbol validation rejects junk', () => {
  assert.ok(SYMBOL_RE.test('^NBI'));
  assert.ok(SYMBOL_RE.test('BRK.B'));
  assert.ok(!SYMBOL_RE.test('<script>'));
  assert.ok(!SYMBOL_RE.test('A'.repeat(20)));
});
