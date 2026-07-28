// Sprint 1A — T5: consolidated QA suite (gate G1 evidence).
//
// Proves, in one place:
//   * Auth matrix on the snapshot route (no key / malformed / wrong / rotated
//     -> 401; valid -> 200).
//   * Recursive PII denial on the full response tree.
//   * Deterministic ETag + 304 flow.
//   * Method denial (405).
//
// The "LEOZOPS key grants nothing on the app's normal auth" property is now
// proven EXECUTABLY against the real route handlers and the real apiUser()
// entry point in tests/leozops-generic-denial.test.mjs (G1 corrective) — the
// former modeled empty-Map assertion was removed as gate evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSnapshot } from '../lib/leozops/handler.js';
import { sha256hex } from '../lib/leozops/auth.js';
import { _resetRateLimit } from '../lib/leozops/ratelimit.js';

const KEY = 'lozk_qa_key';
const HASH = sha256hex(KEY);
const ON = { LEOZOPS_SNAPSHOT_ENABLED: 'true', LEOZOPS_READ_KEY_HASH: HASH };

// Leads deliberately loaded with PII-like columns to prove they never surface.
const loadLeads = async () => [
  { id: 'b', name: 'A', company: 'C', email: 'e@x', phone: '1', note: 'n', source: 'fb', value: 9, stage: 'new', ownerId: 'o1', createdAt: '2026-01-01', expectedClose: '2026-04-01', password: 'p', invoice: 'INV' },
  { id: 'a', name: 'B', company: 'D', email: 'f@x', phone: '2', note: 'm', source: null, value: 0, stage: 'won', ownerId: null, createdAt: null, expectedClose: null },
];
const req = (method, auth, extra = {}) => {
  const h = { ...(auth ? { authorization: auth } : {}), ...extra };
  return { method, url: 'https://erp-egoric.vercel.app/api/integrations/leozops/v1/lead-snapshot', headers: { get: n => h[n.toLowerCase()] ?? null } };
};
const base = over => ({ env: ON, loadLeads, now: () => 0, uuid: () => 'u', log: () => {}, ...over });

test('auth matrix on snapshot route', async () => {
  _resetRateLimit();
  assert.equal((await handleSnapshot(req('GET', null), base())).status, 401, 'no key');
  assert.equal((await handleSnapshot(req('GET', KEY), base())).status, 401, 'malformed (no Bearer)');
  assert.equal((await handleSnapshot(req('GET', 'Bearer wrong'), base())).status, 401, 'wrong key');
  // rotated hash = revoked key
  assert.equal((await handleSnapshot(req('GET', 'Bearer ' + KEY), base({ env: { ...ON, LEOZOPS_READ_KEY_HASH: sha256hex('other') } }))).status, 401, 'revoked');
  assert.equal((await handleSnapshot(req('GET', 'Bearer ' + KEY), base())).status, 200, 'valid');
});

test('recursive PII denial across the entire response tree', async () => {
  _resetRateLimit();
  const r = await handleSnapshot(req('GET', 'Bearer ' + KEY), base());
  assert.equal(r.status, 200);
  const banned = ['name', 'company', 'email', 'phone', 'note', 'owner_id', 'ownerId', 'password', 'invoice'];
  const bannedValues = ['A', 'B', 'C', 'D', 'e@x', 'f@x', 'INV', 'o1'];
  const walk = node => {
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        assert.ok(!banned.includes(k), `banned key "${k}" present`);
        if (typeof v === 'string') assert.ok(!bannedValues.includes(v), `PII value "${v}" present`);
        walk(v);
      }
    }
  };
  walk(r.body);
});

test('deterministic ETag + 304 flow', async () => {
  _resetRateLimit();
  const a = await handleSnapshot(req('GET', 'Bearer ' + KEY), base());
  const b = await handleSnapshot(req('GET', 'Bearer ' + KEY), base({ now: () => 999999 }));
  assert.equal(a.headers.ETag, b.headers.ETag, 'ETag stable across time');
  const notModified = await handleSnapshot(req('GET', 'Bearer ' + KEY, { 'if-none-match': a.headers.ETag }), base());
  assert.equal(notModified.status, 304);
  assert.equal(notModified.body, null);
});

test('method denial -> 405', async () => {
  _resetRateLimit();
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    assert.equal((await handleSnapshot(req(m, 'Bearer ' + KEY), base())).status, 405);
  }
});
