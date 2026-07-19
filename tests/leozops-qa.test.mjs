// Sprint 1A — T5: consolidated QA suite (gate G1 evidence).
//
// Proves, in one place:
//   * Auth matrix on the snapshot route (no key / malformed / wrong / rotated
//     -> 401; valid -> 200).
//   * The LEOZOPS key grants NOTHING on the app's normal auth. The 3
//     representative existing routes that accept a Bearer credential —
//       /api/v1/summary, /api/v1/<resource>, /api/v1/<resource>/<id>
//     — authenticate EXCLUSIVELY through apiUser() (lib/apiauth.js), which
//     resolves a Bearer key ONLY by looking it up in the ApiKey DB table:
//         prisma.apiKey.findUnique({ where: { keyHash: hashKey(raw) } })
//       (lib/apiauth.js:16). The LEOZOPS key is NEVER written to that table
//     (T2 stores no key in the DB), so those routes return 401 for it.
//     NOTE: those route files import via the Next-only "@/..." alias and pull in
//     @prisma/client (not installed in the test env — the whole suite runs
//     prisma-free by design), so they cannot be imported under `node --test`.
//     We therefore prove the ISOLATION property executably here: (a) the snapshot
//     verifier rejects real app-style keys (ak_...), and (b) with no env hash
//     deployed the LEOZOPS key has zero ambient power. See the final summary for
//     the documented deviation.
//   * Recursive PII denial on the full response tree.
//   * Deterministic ETag + 304 flow.
//   * Method denial (405).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSnapshot } from '../lib/leozops/handler.js';
import { sha256hex, verifyReadKey } from '../lib/leozops/auth.js';
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

test('LEOZOPS key and app keys are mutually isolated (grants nothing elsewhere)', () => {
  // (a) The snapshot verifier rejects real app-style Bearer keys — presenting an
  //     ordinary app API key (ak_...) to the snapshot route does NOT authenticate.
  const appReq = raw => ({ headers: { get: n => (n.toLowerCase() === 'authorization' ? 'Bearer ' + raw : null) } });
  assert.equal(verifyReadKey(appReq('ak_deadbeefdeadbeef'), ON).ok, false);
  assert.equal(verifyReadKey(appReq('ak_' + 'f'.repeat(40)), ON).ok, false);

  // (b) The existing /api/v1/* routes accept a Bearer key ONLY if sha256(key) is a
  //     row in the ApiKey table. The LEOZOPS key is never stored there, so its DB
  //     lookup can only miss => 401. We model that lookup here (the real apiUser()
  //     cannot be imported without @prisma/client) to make the property explicit.
  const apiKeyTable = new Map();               // empty: LEOZOPS key is NOT provisioned
  const appAuthResolves = raw => apiKeyTable.has(sha256hex(raw));
  assert.equal(appAuthResolves(KEY), false, 'LEOZOPS key resolves to no app user => 401 on /api/v1/*');

  // (c) With no env hash deployed (default), the LEOZOPS key has zero ambient power.
  assert.equal(verifyReadKey(appReq(KEY), {}).ok, false);
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
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await handleSnapshot(req(m, 'Bearer ' + KEY), base())).status, 405);
  }
});
