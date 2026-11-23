import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { req } from './helpers.mjs';
import { normWorkspace, publicView, tokenMatches, ID_RE, newId } from '../../netlify/lib/workspace.mjs';
import { _resetMemoryForTests } from '../../netlify/lib/store.mjs';
import ws from '../../netlify/functions/workspace.mjs';
import unsubscribe from '../../netlify/functions/unsubscribe.mjs';

const ORIGIN = 'https://kingismymiddlename.github.io';
const call = (method, { id, body, origin = ORIGIN, ip = '9.9.9.9' } = {}) =>
  ws(req('https://site/api/workspace' + (id ? '?id=' + id : ''), { method, origin, body }), { ip });

test('ids are 22 url-safe characters', () => {
  for (let i = 0; i < 20; i++) assert.match(newId(), ID_RE);
});

test('normalisation: dedupe, 50 cap, stages, emails, votes, server-owned fields', () => {
  const accounts = Array.from({ length: 60 }, (_, i) => ({ name: 'Co ' + i }));
  accounts.unshift({ name: 'Pfizer', stage: 'Meeting' }, { name: 'PFIZER' }, { name: '' }, { name: 'X', stage: 'Bogus' });
  const w = normWorkspace({ id: 'x', accounts, digest: { email: 'not-an-email', enabled: true, token: 'client-token', sentIds: ['a'] }, votes: { 'fda_approval:abc': 1, 'bad key': 1, 'x:y': 5 } });
  assert.equal(w.accounts.length, 50);
  assert.equal(w.accounts[0].stage, 'Meeting');
  assert.equal(w.accounts.find((a) => a.name === 'X').stage, 'Monitoring');
  assert.equal(w.digest.enabled, false);
  assert.notEqual(w.digest.token, 'client-token');
  assert.deepEqual(w.digest.sentIds, []);
  assert.deepEqual(w.votes, { 'fda_approval:abc': 1 });
  const pub = publicView(w);
  assert.equal(pub.digest.token, undefined);
  assert.equal(pub.digest.sentIds, undefined);
});

test('create, read, update, conflict, delete', async () => {
  _resetMemoryForTests();
  let r = await call('POST', { body: { workspace: { profile: { firm: 'Acme' }, accounts: [{ name: 'Pfizer' }], digest: { email: 'me@acme.com', enabled: true } } } });
  assert.equal(r.status, 201);
  const created = (await r.json()).workspace;
  assert.match(created.id, ID_RE);
  assert.equal(created.digest.enabled, true);
  assert.equal(created.digest.token, undefined);

  r = await call('GET', { id: created.id });
  assert.equal((await r.json()).workspace.profile.firm, 'Acme');

  r = await call('PUT', { id: created.id, body: { workspace: { ...created, accounts: [...created.accounts, { name: 'Moderna' }] }, baseUpdatedAt: created.updatedAt } });
  const updated = (await r.json()).workspace;
  assert.equal(updated.accounts.length, 2);

  // A stale writer gets 409 with the current copy.
  r = await call('PUT', { id: created.id, body: { workspace: created, baseUpdatedAt: '2000-01-01T00:00:00Z' } });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).workspace.accounts.length, 2);

  r = await call('DELETE', { id: created.id });
  assert.equal(r.status, 200);
  r = await call('GET', { id: created.id });
  assert.equal(r.status, 404);
});

test('guards: bad ids, foreign origins, oversized bodies, creation limit', async () => {
  _resetMemoryForTests();
  assert.equal((await call('GET', { id: 'short' })).status, 400);
  assert.equal((await call('GET', { id: 'A'.repeat(22) })).status, 404);
  assert.equal((await call('POST', { origin: 'https://evil.example', body: {} })).status, 403);
  assert.equal((await call('POST', { body: 'x'.repeat(80000) })).status, 413);
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call('POST', { body: { workspace: {} }, ip: '7.7.7.7' })).status);
  assert.deepEqual(codes, [201, 201, 201, 201, 201, 429]);
});

test('unsubscribe needs the right token and turns the digest off', async () => {
  _resetMemoryForTests();
  const r = await call('POST', { body: { workspace: { accounts: [{ name: 'Pfizer' }], digest: { email: 'me@acme.com', enabled: true } } } });
  const id = (await r.json()).workspace.id;
  const { loadWorkspace } = await import('../../netlify/lib/workspace.mjs');
  const stored = await loadWorkspace(id);
  assert.ok(tokenMatches(stored, stored.digest.token));
  assert.ok(!tokenMatches(stored, 'nope'));
  let u = await unsubscribe(req(`https://site/api/unsubscribe?id=${id}&t=wrong`));
  assert.equal(u.status, 404);
  u = await unsubscribe(req(`https://site/api/unsubscribe?id=${id}&t=${stored.digest.token}`));
  assert.equal(u.status, 200);
  assert.match(await u.text(), /Unsubscribed/);
  assert.equal((await loadWorkspace(id)).digest.enabled, false);
});
