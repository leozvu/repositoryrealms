import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256hex } from '../lib/leozops/auth.js';
import { handleLeadBrief } from '../lib/leozops/brief-handler.js';
import { handleSnapshot } from '../lib/leozops/handler.js';
import { _resetRateLimit } from '../lib/leozops/ratelimit.js';

const BRIEF_KEY = 'lozk_brief_route_key';
const SNAPSHOT_KEY = 'lozk_snapshot_route_key';
const BRIEF_HASH = sha256hex(BRIEF_KEY);
const SNAPSHOT_HASH = sha256hex(SNAPSHOT_KEY);
const ON = { LEOZOPS_BRIEF_ENABLED: 'true', LEOZOPS_BRIEF_READ_KEY_HASH: BRIEF_HASH };
const NOW = Date.parse('2026-07-29T12:00:00.000Z');
const GENERATED_UUID = '11111111-2222-4333-8444-555555555555';

const LEADS = [
  { id: 'l1', source: null, value: 100, stage: 'new', ownerId: null, createdAt: '2026-07-01', expectedClose: null },
  { id: 'l2', source: 'fb', value: 200, stage: 'proposal', ownerId: 'private-owner', createdAt: '2026-06-01', expectedClose: '2026-07-10' },
];

const request = ({ method = 'GET', key = BRIEF_KEY, headers = {} } = {}) => {
  const all = { authorization: key === null ? null : `Bearer ${key}`, ...headers };
  return {
    method,
    url: 'https://erp-egoric.vercel.app/api/integrations/leozops/v1/lead-brief',
    headers: { get: name => all[name.toLowerCase()] ?? null },
  };
};

const options = (over = {}) => ({
  env: ON,
  loadLeads: async () => LEADS,
  now: () => NOW,
  uuid: () => GENERATED_UUID,
  log: () => {},
  ...over,
});

test('default-off and explicit false make the route absent', async () => {
  _resetRateLimit();
  for (const env of [{ LEOZOPS_BRIEF_READ_KEY_HASH: BRIEF_HASH }, { ...ON, LEOZOPS_BRIEF_ENABLED: 'false' }]) {
    const response = await handleLeadBrief(request(), options({ env }));
    assert.equal(response.status, 404);
    assert.deepEqual(response.headers, {});
  }
});

test('brief route requires its own valid key and denies the snapshot key', async () => {
  _resetRateLimit();
  assert.equal((await handleLeadBrief(request({ key: null }), options())).status, 401);
  assert.equal((await handleLeadBrief(request({ key: 'wrong' }), options())).status, 401);
  assert.equal((await handleLeadBrief(request({ key: SNAPSHOT_KEY }), options())).status, 401);
  assert.equal((await handleLeadBrief(request(), options())).status, 200);
});

test('the brief key has no authority on the snapshot route', async () => {
  _resetRateLimit();
  const env = { LEOZOPS_SNAPSHOT_ENABLED: 'true', LEOZOPS_READ_KEY_HASH: SNAPSHOT_HASH };
  const response = await handleSnapshot(request({ key: BRIEF_KEY }), {
    env,
    loadLeads: async () => LEADS,
    now: () => NOW,
    uuid: () => GENERATED_UUID,
    log: () => {},
  });
  assert.equal(response.status, 401);
});

test('valid GET returns the deterministic brief contract and private cache headers', async () => {
  _resetRateLimit();
  const response = await handleLeadBrief(request(), options());
  assert.equal(response.status, 200);
  assert.equal(response.body.as_of_date, '2026-07-29');
  assert.equal(response.body.metrics.total_leads, 2);
  assert.equal(response.headers.ETag, `"${response.body.brief_id}"`);
  assert.equal(response.headers['Cache-Control'], 'private, no-cache');
  assert.equal(response.headers['X-Correlation-ID'], GENERATED_UUID);
});

test('all non-GET methods are explicit 405 responses while enabled', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    _resetRateLimit();
    const response = await handleLeadBrief(request({ method }), options());
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.Allow, 'GET');
  }
});

test('conditional GET supports quoted, weak, list and wildcard validators', async () => {
  _resetRateLimit();
  const first = await handleLeadBrief(request(), options());
  for (const validator of [first.headers.ETag, `W/${first.headers.ETag}`, `"other", ${first.headers.ETag}`, '*']) {
    _resetRateLimit();
    const response = await handleLeadBrief(request({ headers: { 'if-none-match': validator } }), options());
    assert.equal(response.status, 304, validator);
    assert.equal(response.body, null);
    assert.equal(response.headers.ETag, first.headers.ETag);
  }
});

test('invalid correlation input is replaced and never logged', async () => {
  _resetRateLimit();
  const malicious = 'victim@example.com\r\nAuthorization: Bearer secret';
  const lines = [];
  const response = await handleLeadBrief(
    request({ headers: { 'x-correlation-id': malicious } }),
    options({ log: line => lines.push(String(line)) }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers['X-Correlation-ID'], GENERATED_UUID);
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes('victim@example.com'));
  assert.ok(!lines[0].includes('Bearer secret'));
});

test('audit event contains aggregate facts and no PII or raw key', async () => {
  _resetRateLimit();
  const lines = [];
  await handleLeadBrief(request(), options({ log: line => lines.push(String(line)) }));
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.evt, 'leozops_lead_brief');
  assert.equal(event.status, 200);
  assert.equal(event.record_count, 2);
  assert.ok(event.signal_count > 0);
  assert.ok(event.brief_id.startsWith('sha256:'));
  assert.ok(event.source_snapshot_id.startsWith('sha256:'));
  assert.equal(event.key_fingerprint, BRIEF_HASH.slice(0, 8));
  assert.ok(!lines[0].includes(BRIEF_KEY));
  assert.ok(!lines[0].includes('private-owner'));
});

test('rate limit is isolated and returns Retry-After', async () => {
  _resetRateLimit();
  const limited = options({ rateLimit: { limit: 2, windowMs: 3_600_000 } });
  assert.equal((await handleLeadBrief(request(), limited)).status, 200);
  assert.equal((await handleLeadBrief(request(), limited)).status, 200);
  const denied = await handleLeadBrief(request(), limited);
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers['Retry-After']) > 0);
});

test('source/projector failures fail closed without leaking error details', async () => {
  _resetRateLimit();
  const secret = 'database-password-is-secret';
  const lines = [];
  const response = await handleLeadBrief(request(), options({
    loadLeads: async () => { throw new Error(secret); },
    log: line => lines.push(String(line)),
  }));
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'brief unavailable' });
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).status, 500);
  assert.ok(!JSON.stringify(response).includes(secret));
  assert.ok(!lines[0].includes(secret));
});
