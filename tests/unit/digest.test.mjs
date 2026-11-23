import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, req, RSS } from './helpers.mjs';
import { selectDigest, renderDigest, sendEmail, maskEmail } from '../../netlify/lib/digest.mjs';
import { normWorkspace, saveWorkspace, loadWorkspace, newId } from '../../netlify/lib/workspace.mjs';
import { _resetMemoryForTests } from '../../netlify/lib/store.mjs';
import { runDigest, weekStart } from '../../netlify/functions/digest-weekly.mjs';
import digest from '../../netlify/functions/digest.mjs';
import signals from '../../netlify/functions/signals.mjs';

const NOW = Date.parse('2026-11-23T02:00:00Z');
const sig = (id, type, daysAgo) => ({ id, type, label: type, title: 'T ' + id, source: 'S', url: 'https://s/' + id, date: new Date(NOW - daysAgo * 86400000).toISOString(), points: 5 });

test('weekly selection skips sent, old and mention-only signals', () => {
  const ws = { digest: { sentIds: ['a'] }, accounts: [] };
  const results = [
    { id: 'x', name: 'X', score: 60, band: 'Hot', signals: [sig('a', 'fda_approval', 1), sig('b', 'financing', 2), sig('c', 'mention', 1)] },
    { id: 'y', name: 'Y', score: 20, band: 'Cool', signals: [sig('d', 'leadership', 12)] },
  ];
  const { rows, newIds } = selectDigest(ws, results, { mode: 'weekly', now: NOW });
  assert.deepEqual(rows.map((r) => [r.id, r.fresh.map((s) => s.id)]), [['x', ['b']]]);
  assert.deepEqual(newIds, ['b']);
  const test2 = selectDigest(ws, results, { mode: 'test', now: NOW });
  assert.equal(test2.rows.length, 2);
});

test('rendered email escapes content, links to the app and has unsubscribe', () => {
  const ws = { id: 'W'.repeat(22), profile: { firm: 'Acme <b>' }, accounts: [{}, {}], digest: { token: 'tok' } };
  const rows = [{ id: 'pfizer', name: 'Pfizer <script>', score: 70, band: 'Hot', fresh: [sig('z', 'fda_approval', 1)] }];
  const m = renderDigest(ws, rows, { mode: 'weekly', now: new Date(NOW) });
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('Pfizer &lt;script&gt;'));
  assert.ok(m.html.includes('#/week?w=' + 'W'.repeat(22) + '&amp;a=pfizer'));
  assert.ok(m.unsubscribeUrl.includes('/api/unsubscribe?id=' + 'W'.repeat(22) + '&t=tok'));
  assert.ok(!/<img/i.test(m.html), 'no tracking pixels');
  assert.match(m.subject, /1 account with new signals/);
  assert.equal(maskEmail('nitish@example.com'), 'ni••••@example.com');
});

test('sendEmail posts to Resend with unsubscribe headers; errors are clear', async () => {
  delete process.env.RESEND_API_KEY;
  await assert.rejects(sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't', unsubscribeUrl: 'https://u' }), (e) => e.code === 'email_not_configured');
  process.env.RESEND_API_KEY = 're_test';
  let m = mockFetch([['api.resend.com', () => ({ json: { id: 'em_1' } })]]);
  const r = await sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't', unsubscribeUrl: 'https://u' });
  assert.equal(r.id, 'em_1');
  const body = JSON.parse(m.calls[0].opts.body);
  assert.equal(body.headers['List-Unsubscribe'], '<https://u>');
  assert.equal(body.from, 'BioPulse <onboarding@resend.dev>');
  m.restore();
  m = mockFetch([['api.resend.com', () => ({ status: 403, json: { message: 'domain not verified' } })]]);
  await assert.rejects(sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't', unsubscribeUrl: 'https://u' }), (e) => e.code === 'email_rejected');
  m.restore();
});

test('weekStart is the Monday of the week (UTC)', () => {
  assert.equal(weekStart(new Date('2026-11-23T10:00:00Z')).toISOString().slice(0, 10), '2026-11-23');
  assert.equal(weekStart(new Date('2026-11-29T10:00:00Z')).toISOString().slice(0, 10), '2026-11-23');
});

function upstream(sent) {
  const now = new Date().toUTCString();
  return mockFetch([
    ['statnews.com', () => ({ body: RSS([{ title: 'Pfizer names new chief data officer', link: 'https://stat/1', date: now }]) })],
    ['clinicaltrials.gov', () => ({ json: { totalCount: 0, studies: [] } })],
    ['api.fda.gov', () => ({ status: 404, json: {} })],
    ['api.resend.com', (u, o) => {
      sent.push(JSON.parse(o.body));
      return { json: { id: 'em' } };
    }],
  ]);
}

test('scheduled digest sends once per week and records sent signals', async () => {
  _resetMemoryForTests();
  process.env.RESEND_API_KEY = 're_test';
  const id = newId();
  await saveWorkspace(normWorkspace({ id, accounts: [{ name: 'Pfizer' }], digest: { email: 'me@acme.com', enabled: true } }));
  const off = newId();
  await saveWorkspace(normWorkspace({ id: off, accounts: [{ name: 'Pfizer' }], digest: { email: 'x@acme.com', enabled: false } }));
  const sent = [];
  const m = upstream(sent);
  try {
    let s = await runDigest({ now: new Date() });
    assert.equal(s.sent, 1);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ['me@acme.com']);
    assert.match(sent[0].html, /chief data officer/);
    const ws = await loadWorkspace(id);
    assert.ok(ws.digest.lastSentAt);
    assert.equal(ws.digest.sentIds.length, 1);
    s = await runDigest({ now: new Date() }); // same week: nothing more
    assert.equal(s.sent, 0);
    assert.equal(sent.length, 1);
  } finally {
    m.restore();
  }
});

test('test digest endpoint: needs email, rate limited, sends', async () => {
  _resetMemoryForTests();
  process.env.RESEND_API_KEY = 're_test';
  const id = newId();
  await saveWorkspace(normWorkspace({ id, accounts: [{ name: 'Pfizer' }], digest: { email: 'me@acme.com', enabled: false } }));
  const noMail = newId();
  await saveWorkspace(normWorkspace({ id: noMail, accounts: [{ name: 'Pfizer' }] }));
  const sent = [];
  const m = upstream(sent);
  const post = (wid) => digest(req('https://site/api/digest', { method: 'POST', origin: 'https://kingismymiddlename.github.io', body: { id: wid } }));
  try {
    assert.equal((await post(noMail)).status, 400);
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await post(id)).status);
    assert.deepEqual(codes, [200, 200, 200, 429]);
    assert.equal(sent.length, 3);
  } finally {
    m.restore();
  }
});

test('signals endpoint validates and scores', async () => {
  _resetMemoryForTests();
  const sent = [];
  const m = upstream(sent);
  const post = (body) => signals(req('https://site/api/signals', { method: 'POST', origin: 'https://kingismymiddlename.github.io', body }), { ip: '1.2.3.4' });
  try {
    assert.equal((await post({ accounts: [] })).status, 400);
    assert.equal((await post({ accounts: Array.from({ length: 11 }, (_, i) => ({ name: 'C' + i })) })).status, 400);
    const r = await post({ accounts: [{ id: 'pfizer', name: 'Pfizer' }] });
    const d = await r.json();
    assert.equal(r.status, 200);
    assert.equal(d.results[0].signals[0].type, 'leadership');
    assert.equal(d.results[0].score, 45);
  } finally {
    m.restore();
  }
});
