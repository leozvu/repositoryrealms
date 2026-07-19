// Sprint 1A — G1 corrective tests (Codex G1 FAIL follow-up).
//
// Covers three of the four G1 gaps directly against the REAL handler/auth code:
//   1. Correlation-ID confidentiality: only a strict UUID is accepted from the
//      caller; every rejected value (email, token-like, control chars,
//      oversized) is replaced with a fresh UUID and NEVER appears in any log
//      line or response header.
//   2. Standards-compliant ETag: quoted validator on the wire, quoted/weak
//      If-None-Match handling, snapshot_id semantics preserved, generated_at
//      excluded from the hash.
//   4. Deployment-instance isolation: only the deployment's own
//      LEOZOPS_READ_KEY_HASH validates; an absent hash or another deployment's
//      hash denies. No tenant-wide shared credential exists anywhere.
// (Gap 3 — the real generic-API denial matrix — lives in
//  tests/leozops-generic-denial.test.mjs, which executes the actual routes.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSnapshot } from '../lib/leozops/handler.js';
import { sha256hex, verifyReadKey } from '../lib/leozops/auth.js';
import { _resetRateLimit } from '../lib/leozops/ratelimit.js';

const KEY = 'lozk_g1_key';
const HASH = sha256hex(KEY);
const ON = { LEOZOPS_SNAPSHOT_ENABLED: 'true', LEOZOPS_READ_KEY_HASH: HASH };

const loadLeads = async () => [
  { id: 'l1', source: 'fb', value: 100, stage: 'new', ownerId: 'u1', createdAt: '2026-01-01', expectedClose: null },
];

const req = (extra = {}) => {
  const h = { authorization: 'Bearer ' + KEY, ...extra };
  return {
    method: 'GET',
    url: 'https://erp-egoric.vercel.app/api/integrations/leozops/v1/lead-snapshot',
    headers: { get: n => h[n.toLowerCase()] ?? null },
  };
};
const FRESH = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'; // deterministic "generated" UUID
const base = over => ({ env: ON, loadLeads, now: () => 0, uuid: () => FRESH, log: () => {}, ...over });

/* ------------------------------------------------------------------ */
/* 1. Correlation-ID confidentiality                                   */
/* ------------------------------------------------------------------ */

// Each adversarial value must (a) NOT be echoed in X-Correlation-ID, (b) NOT
// appear in any log line, and (c) be replaced by a freshly generated UUID.
const ADVERSARIAL_CORRELATION_IDS = [
  ['email address', 'victim.user@example.com', 'victim.user@example.com'],
  ['bearer-token-like string', 'Bearer eyJhbGciOiJIUzI1NiJ9.secret-payload.sig', 'eyJhbGciOiJIUzI1NiJ9'],
  ['control characters (header injection)', 'abc\r\nSet-Cookie: pwned=1\x00', 'Set-Cookie'],
  ['oversized input', 'A'.repeat(64 * 1024), 'AAAAAAAAAA'],
  ['malformed near-uuid (too short)', 'abc-123', 'abc-123'],
  ['uuid with trailing junk', FRESH + 'X', FRESH + 'X'],
];

for (const [label, value, needle] of ADVERSARIAL_CORRELATION_IDS) {
  test(`correlation-id rejects ${label}: fresh UUID substituted, input never logged`, async () => {
    _resetRateLimit();
    const lines = [];
    const r = await handleSnapshot(
      req({ 'x-correlation-id': value }),
      base({ log: m => lines.push(String(m)) }),
    );
    assert.equal(r.status, 200);
    // (a) not echoed — the generated UUID is used instead
    assert.equal(r.headers['X-Correlation-ID'], FRESH, 'rejected input must not be echoed');
    // (b) rejected caller input never reaches the logs
    assert.equal(lines.length, 1, 'exactly one audit line');
    for (const line of lines) {
      assert.ok(!line.includes(needle), `rejected input leaked into log line: ${label}`);
    }
    // (c) the audit line carries the generated UUID
    assert.equal(JSON.parse(lines[0]).correlation_id, FRESH);
  });
}

test('correlation-id preserves a valid strict UUID (header + audit log)', async () => {
  _resetRateLimit();
  const CALLER = '0F1E2D3C-4b5a-4967-8879-a0b1c2d3e4f5'; // mixed case is still a UUID
  const lines = [];
  const r = await handleSnapshot(req({ 'x-correlation-id': CALLER }), base({ log: m => lines.push(String(m)) }));
  assert.equal(r.status, 200);
  assert.equal(r.headers['X-Correlation-ID'], CALLER);
  assert.equal(JSON.parse(lines[0]).correlation_id, CALLER);
});

test('correlation-id rejection also holds on the 401 path (nothing logged pre-auth)', async () => {
  _resetRateLimit();
  const lines = [];
  const r = await handleSnapshot(
    { method: 'GET', url: 'https://x/api', headers: { get: n => (n === 'x-correlation-id' ? 'attacker@evil.example' : null) } },
    base({ log: m => lines.push(String(m)) }),
  );
  assert.equal(r.status, 401);
  assert.equal(r.headers['X-Correlation-ID'], FRESH);
  for (const line of lines) assert.ok(!line.includes('attacker@evil.example'));
});

/* ------------------------------------------------------------------ */
/* 2. Standards-compliant ETag                                         */
/* ------------------------------------------------------------------ */

test('ETag header is the QUOTED snapshot_id; body snapshot_id stays unquoted', async () => {
  _resetRateLimit();
  const r = await handleSnapshot(req(), base());
  assert.equal(r.status, 200);
  assert.ok(r.body.snapshot_id.startsWith('sha256:'), 'snapshot_id semantics preserved');
  assert.equal(r.headers.ETag, `"${r.body.snapshot_id}"`, 'header must be a quoted validator');
  assert.ok(r.headers.ETag.startsWith('"') && r.headers.ETag.endsWith('"'));
});

test('quoted If-None-Match matching the current snapshot -> 304, empty body', async () => {
  _resetRateLimit();
  const first = await handleSnapshot(req(), base());
  const r = await handleSnapshot(req({ 'if-none-match': first.headers.ETag }), base());
  assert.equal(r.status, 304);
  assert.equal(r.body, null);
  assert.equal(r.headers.ETag, first.headers.ETag);
});

test('weak-form and list-form If-None-Match also match -> 304', async () => {
  _resetRateLimit();
  const first = await handleSnapshot(req(), base());
  const weak = await handleSnapshot(req({ 'if-none-match': 'W/' + first.headers.ETag }), base());
  assert.equal(weak.status, 304, 'weak comparison applies for GET');
  const list = await handleSnapshot(req({ 'if-none-match': '"sha256:other", ' + first.headers.ETag }), base());
  assert.equal(list.status, 304, 'tag anywhere in the list matches');
});

test('nonmatching If-None-Match -> 200 with full body', async () => {
  _resetRateLimit();
  const r = await handleSnapshot(req({ 'if-none-match': '"sha256:' + 'd'.repeat(64) + '"' }), base());
  assert.equal(r.status, 200);
  assert.ok(r.body && r.body.snapshot_id);
});

test('absent If-None-Match -> 200 with full body', async () => {
  _resetRateLimit();
  const r = await handleSnapshot(req(), base());
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.leads));
});

test('snapshot_id unchanged across time (generated_at excluded from hash)', async () => {
  _resetRateLimit();
  const a = await handleSnapshot(req(), base({ now: () => 0 }));
  const b = await handleSnapshot(req(), base({ now: () => 86_400_000 }));
  assert.equal(a.body.snapshot_id, b.body.snapshot_id, 'same facts -> same snapshot_id');
  assert.equal(a.headers.ETag, b.headers.ETag, 'same facts -> same ETag');
  assert.notEqual(a.body.generated_at, b.body.generated_at, 'generated_at DOES move');
});

/* ------------------------------------------------------------------ */
/* 4. Deployment-instance isolation                                    */
/* ------------------------------------------------------------------ */

// Two independent deployments, each with its OWN key + env hash. There is no
// tenant-wide credential: the only secret material is per-deployment env.
const KEY_A = 'lozk_deploy_A_key';
const KEY_B = 'lozk_deploy_B_key';
const ENV_A = { LEOZOPS_SNAPSHOT_ENABLED: 'true', LEOZOPS_READ_KEY_HASH: sha256hex(KEY_A) };
const ENV_B = { LEOZOPS_SNAPSHOT_ENABLED: 'true', LEOZOPS_READ_KEY_HASH: sha256hex(KEY_B) };
const asBearer = key => req({ authorization: 'Bearer ' + key });

test('deployment isolation: absent instance key hash denies ALL keys', async () => {
  _resetRateLimit();
  const envNoHash = { LEOZOPS_SNAPSHOT_ENABLED: 'true' }; // flag on, hash not deployed
  for (const key of [KEY_A, KEY_B, KEY]) {
    const r = await handleSnapshot(asBearer(key), base({ env: envNoHash }));
    assert.equal(r.status, 401, 'no deployed hash -> nothing validates');
  }
  assert.equal(verifyReadKey(asBearer(KEY_A), envNoHash).ok, false);
});

test("deployment isolation: another deployment's key is denied in both directions", async () => {
  _resetRateLimit();
  // B's key against deployment A -> 401; A's key against deployment B -> 401.
  assert.equal((await handleSnapshot(asBearer(KEY_B), base({ env: ENV_A }))).status, 401);
  assert.equal((await handleSnapshot(asBearer(KEY_A), base({ env: ENV_B }))).status, 401);
  assert.equal(verifyReadKey(asBearer(KEY_B), ENV_A).ok, false);
  assert.equal(verifyReadKey(asBearer(KEY_A), ENV_B).ok, false);
});

test('deployment isolation: only the matching deployment-specific hash is accepted', async () => {
  _resetRateLimit();
  assert.equal((await handleSnapshot(asBearer(KEY_A), base({ env: ENV_A }))).status, 200);
  _resetRateLimit();
  assert.equal((await handleSnapshot(asBearer(KEY_B), base({ env: ENV_B }))).status, 200);
  // And the two deployments share NO credential material.
  assert.notEqual(ENV_A.LEOZOPS_READ_KEY_HASH, ENV_B.LEOZOPS_READ_KEY_HASH);
});
