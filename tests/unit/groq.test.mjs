import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch } from './helpers.mjs';
import { generateJSON, parseJSONLoose, AIError } from '../../netlify/lib/groq.mjs';

const ok = (content) => ({ json: { choices: [{ message: { content } }], usage: { total_tokens: 10 } } });

test('parseJSONLoose tolerates fences and trailing commas', () => {
  assert.deepEqual(parseJSONLoose('```json\n{"a":[1,2,],}\n```'), { a: [1, 2] });
  assert.throws(() => parseJSONLoose('no json'), AIError);
});

test('generateJSON errors clearly when key missing', async () => {
  delete process.env.GROQ_API_KEY;
  await assert.rejects(generateJSON({ system: 's', user: 'u' }), (e) => e.code === 'ai_not_configured' && e.status === 503);
});

test('generateJSON sends the key server-side with gpt-oss defaults', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  const m = mockFetch([['api.groq.com', () => ok('{"x":1}')]]);
  try {
    const r = await generateJSON({ system: 's', user: 'u' });
    assert.deepEqual(r.data, { x: 1 });
    const sent = JSON.parse(m.calls[0].opts.body);
    assert.equal(sent.model, 'openai/gpt-oss-120b');
    assert.equal(sent.reasoning_effort, 'low');
    assert.deepEqual(sent.response_format, { type: 'json_object' });
    assert.equal(m.calls[0].opts.headers.Authorization, 'Bearer gsk_test');
  } finally {
    m.restore();
  }
});

test('falls back to the second model when the first is unavailable', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  const m = mockFetch([
    ['api.groq.com', (u, o) => (JSON.parse(o.body).model === 'openai/gpt-oss-120b'
      ? { status: 404, json: { error: { message: 'The model does not exist' } } }
      : ok('{"y":2}'))],
  ]);
  try {
    const r = await generateJSON({ system: 's', user: 'u' });
    assert.equal(r.model, 'openai/gpt-oss-20b');
    assert.deepEqual(r.data, { y: 2 });
  } finally {
    m.restore();
  }
});

test('retries without JSON mode when Groq rejects it', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  const m = mockFetch([
    ['api.groq.com', (u, o) => (JSON.parse(o.body).response_format
      ? { status: 400, json: { error: { message: 'json_validate_failed: Failed to generate JSON' } } }
      : ok('Here: {"z":3}'))],
  ]);
  try {
    const r = await generateJSON({ system: 's', user: 'u' });
    assert.deepEqual(r.data, { z: 3 });
    assert.equal(m.calls.length, 2);
  } finally {
    m.restore();
  }
});

test('maps 401 and 429 to actionable errors', async () => {
  process.env.GROQ_API_KEY = 'gsk_bad';
  let m = mockFetch([['api.groq.com', () => ({ status: 401, json: { error: { message: 'Invalid API Key' } } })]]);
  await assert.rejects(generateJSON({ system: 's', user: 'u' }), (e) => e.code === 'ai_bad_key');
  m.restore();
  m = mockFetch([['api.groq.com', () => ({ status: 429, json: { error: { message: 'Rate limit' } } })]]);
  await assert.rejects(generateJSON({ system: 's', user: 'u' }), (e) => e.code === 'ai_rate_limited' && e.status === 429);
  m.restore();
});
