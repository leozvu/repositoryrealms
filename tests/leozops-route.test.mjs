// Sprint 1A — T3 tests: feature flag, auth matrix, method denial, response shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSnapshot } from '../lib/leozops/handler.js';
import { sha256hex } from '../lib/leozops/auth.js';

const KEY = 'lozk_route_test_key';
const HASH = sha256hex(KEY);
const ON = { LEOZOPS_SNAPSHOT_ENABLED: 'true', LEOZOPS_READ_KEY_HASH: HASH };

const FAKE_LEADS = [
  { id: 'l2', source: 'fb', value: 100, stage: 'new', ownerId: 'u1', createdAt: '2026-01-01', expectedClose: null },
  { id: 'l1', source: null, value: 0, stage: 'won', ownerId: null, createdAt: null, expectedClose: null },
];
const loadLeads = async () => FAKE_LEADS;

const req = (method, authHeader) => ({
  method,
  headers: { get: n => (n.toLowerCase() === 'authorization' ? (authHeader ?? null) : null) },
});
const opts = (env = ON) => ({ env, loadLeads, now: () => 0 });

test('flag off (absent) -> 404', async () => {
  const r = await handleSnapshot(req('GET', 'Bearer ' + KEY), opts({ LEOZOPS_READ_KEY_HASH: HASH }));
  assert.equal(r.status, 404);
});

test('flag explicitly false -> 404', async () => {
  const r = await handleSnapshot(req('GET', 'Bearer ' + KEY), opts({ LEOZOPS_SNAPSHOT_ENABLED: 'false', LEOZOPS_READ_KEY_HASH: HASH }));
  assert.equal(r.status, 404);
});

test('flag on + no key -> 401', async () => {
  assert.equal((await handleSnapshot(req('GET', null), opts())).status, 401);
});

test('flag on + wrong key -> 401', async () => {
  assert.equal((await handleSnapshot(req('GET', 'Bearer nope'), opts())).status, 401);
});

test('flag on + hash absent -> 401 (nothing validates)', async () => {
  const r = await handleSnapshot(req('GET', 'Bearer ' + KEY), opts({ LEOZOPS_SNAPSHOT_ENABLED: 'true' }));
  assert.equal(r.status, 401);
});

test('flag on + valid key -> 200 with T1 payload', async () => {
  const r = await handleSnapshot(req('GET', 'Bearer ' + KEY), opts());
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), [
    'schema_version', 'source', 'snapshot_id', 'generated_at', 'funnel_definition', 'leads', 'quality',
  ]);
  assert.equal(r.body.leads.length, 2);
  assert.deepEqual(r.body.leads.map(l => l.external_id), ['l1', 'l2']); // sorted
  assert.ok(r.body.snapshot_id.startsWith('sha256:'));
});

test('non-GET methods -> 405 when flag on', async () => {
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await handleSnapshot(req(m, 'Bearer ' + KEY), opts());
    assert.equal(r.status, 405, `${m} should be 405`);
    assert.equal(r.headers.Allow, 'GET');
  }
});

test('non-GET still 404 when flag off (route absent)', async () => {
  const r = await handleSnapshot(req('POST', 'Bearer ' + KEY), opts({ LEOZOPS_READ_KEY_HASH: HASH }));
  assert.equal(r.status, 404);
});
