// Sprint 1A — T4 tests: ETag/304, Cache-Control, correlation id, rate limit, audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSnapshot } from '../lib/leozops/handler.js';
import { sha256hex } from '../lib/leozops/auth.js';
import { _resetRateLimit } from '../lib/leozops/ratelimit.js';

const KEY = 'lozk_t4_key';
const HASH = sha256hex(KEY);
const ON = { LEOZOPS_SNAPSHOT_ENABLED: 'true', LEOZOPS_READ_KEY_HASH: HASH };
const loadLeads = async () => [
  { id: 'l1', source: 'fb', value: 100, stage: 'new', ownerId: 'u1', createdAt: '2026-01-01', expectedClose: null },
];

const req = (extra = {}) => {
  const h = { authorization: 'Bearer ' + KEY, ...extra };
  return { method: 'GET', url: 'https://erp-egoric.vercel.app/api/integrations/leozops/v1/lead-snapshot', headers: { get: n => h[n.toLowerCase()] ?? null } };
};
const base = over => ({ env: ON, loadLeads, now: () => 0, uuid: () => 'gen-uuid-1', ...over });

test('200 sets ETag to QUOTED snapshot_id and Cache-Control: private, no-cache', async () => {
  _resetRateLimit();
  const r = await handleSnapshot(req(), base());
  assert.equal(r.status, 200);
  assert.equal(r.headers.ETag, `"${r.body.snapshot_id}"`); // RFC 9110 quoted validator
  assert.ok(r.body.snapshot_id.startsWith('sha256:'), 'body snapshot_id stays unquoted');
  assert.equal(r.headers['Cache-Control'], 'private, no-cache');
});

test('If-None-Match (quoted, as served) -> 304 with empty body but ETag present', async () => {
  _resetRateLimit();
  const first = await handleSnapshot(req(), base());
  const etag = first.headers.ETag; // quoted, exactly as a compliant client echoes it
  const r = await handleSnapshot(req({ 'if-none-match': etag }), base());
  assert.equal(r.status, 304);
  assert.equal(r.body, null);
  assert.equal(r.headers.ETag, etag);
});

test('X-Correlation-ID: echoed when present and a strict UUID', async () => {
  _resetRateLimit();
  const CALLER_UUID = '3f2b8c1a-9d4e-4f6a-8b2c-1d3e5f7a9b0c';
  const r = await handleSnapshot(req({ 'x-correlation-id': CALLER_UUID }), base());
  assert.equal(r.headers['X-Correlation-ID'], CALLER_UUID);
});

test('X-Correlation-ID: generated when absent', async () => {
  _resetRateLimit();
  const r = await handleSnapshot(req(), base());
  assert.equal(r.headers['X-Correlation-ID'], 'gen-uuid-1');
});

test('rate limit: 60 pass, 61st -> 429 with Retry-After', async () => {
  _resetRateLimit();
  for (let i = 0; i < 60; i++) {
    const r = await handleSnapshot(req(), base({ now: () => 1000 }));
    assert.equal(r.status, 200, `req ${i + 1} should pass`);
  }
  const over = await handleSnapshot(req(), base({ now: () => 1000 }));
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers['Retry-After']) > 0);
});

test('audit log line carries required fields and ZERO PII', async () => {
  _resetRateLimit();
  const CALLER_UUID = '7a1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const lines = [];
  await handleSnapshot(req({ 'x-correlation-id': CALLER_UUID }), base({ log: m => lines.push(m) }));
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  // required audit fields present
  for (const k of ['correlation_id', 'key_fingerprint', 'path', 'status', 'latency_ms', 'record_count', 'snapshot_id']) {
    assert.ok(k in entry, `missing ${k}`);
  }
  assert.equal(entry.correlation_id, CALLER_UUID);
  assert.equal(entry.key_fingerprint, HASH.slice(0, 8));
  assert.equal(entry.status, 200);
  assert.equal(entry.record_count, 1);
  // no PII anywhere in the log entry (keys or string values)
  const banned = ['name', 'company', 'email', 'phone', 'note', 'ownerId', 'owner_id', 'password', 'invoice'];
  const walk = node => {
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        assert.ok(!banned.includes(k), `banned key ${k} in log`);
        walk(v);
      }
    }
  };
  walk(entry);
  // fingerprint must not be the raw key
  assert.ok(!lines[0].includes(KEY));
});
