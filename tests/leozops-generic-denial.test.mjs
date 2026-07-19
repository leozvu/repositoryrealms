// Sprint 1A — G1 corrective: REAL generic-API denial matrix.
//
// Replaces the former modeled "empty ApiKey Map" assertion in leozops-qa with
// executable tests against the ACTUAL generic API route handlers:
//   app/api/v1/summary/route.js            (GET)
//   app/api/v1/[resource]/route.js         (GET, POST)
//   app/api/v1/[resource]/[id]/route.js    (GET, PUT, DELETE)
// plus their sole real auth entry point, apiUser() in lib/apiauth.js.
//
// How it runs prisma-free: a test-scoped ESM loader (helpers/leozops-esm-loader.mjs)
// resolves the '@/' alias to the repo root and stubs ONLY the two npm packages
// absent from the test env ('next/server', '@prisma/client'). All auth code and
// route code executed here is the real production source. The prisma stub
// records every model.operation and makes every lookup MISS — exactly the real
// DB behavior for the LEOZOPS key, which is never provisioned in the ApiKey
// table (T2 stores no key material in the DB).
//
// Proven for every method: presenting the LEOZOPS_READ key yields 401/403
// (secure denial), never 2xx, the request body is never read, and the ONLY
// database access is the apiKey.findUnique auth lookup — no business handler
// executes. Generic auth itself is untouched by this suite.

import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyReadKey } from '../lib/leozops/auth.js';

register('./helpers/leozops-esm-loader.mjs', import.meta.url);

const { prismaOps, _resetPrismaOps } = await import('./helpers/stub-prisma-client.mjs');
const { apiUser } = await import('../lib/apiauth.js');
const summaryRoute = await import('../app/api/v1/summary/route.js');
const collectionRoute = await import('../app/api/v1/[resource]/route.js');
const itemRoute = await import('../app/api/v1/[resource]/[id]/route.js');

const LEOZOPS_KEY = 'lozk_live_g1_denial_matrix_key';
const KEY_HASH = crypto.createHash('sha256').update(LEOZOPS_KEY).digest('hex');

// Even with the snapshot feature FULLY enabled for this key in this process,
// the generic routes must still deny it — they never consult LEOZOPS env.
process.env.LEOZOPS_SNAPSHOT_ENABLED = 'true';
process.env.LEOZOPS_READ_KEY_HASH = KEY_HASH;

// A request carrying the LEOZOPS key. req.json THROWS: if any handler ever
// reads the body, the test fails loudly — business logic must never run.
const leozReq = () => ({
  method: 'GET',
  headers: { get: n => (n.toLowerCase() === 'authorization' ? 'Bearer ' + LEOZOPS_KEY : null) },
  json: async () => { throw new Error('business handler executed: request body was read'); },
});

function assertSecureDenial(res, label) {
  assert.ok(res.status === 401 || res.status === 403, `${label}: expected 401/403, got ${res.status}`);
  assert.ok(!(res.status >= 200 && res.status < 300), `${label}: must not be 2xx`);
  // The ONLY DB access is the auth lookup by sha256(key) — and it missed.
  assert.ok(prismaOps.length >= 1, `${label}: auth lookup must have executed`);
  for (const op of prismaOps) {
    assert.equal(op.call, 'apiKey.findUnique', `${label}: unexpected DB access ${op.call} — business handler ran`);
    assert.equal(op.args[0]?.where?.keyHash, KEY_HASH, `${label}: auth must look up sha256(presented key)`);
  }
}

test('real auth entry point: apiUser() resolves the LEOZOPS key to NO user', async () => {
  _resetPrismaOps();
  const user = await apiUser(leozReq());
  assert.equal(user, null, 'LEOZOPS key is not in the ApiKey table -> no virtual user');
  assert.equal(prismaOps.length, 1);
  assert.equal(prismaOps[0].call, 'apiKey.findUnique');
  assert.equal(prismaOps[0].args[0].where.keyHash, KEY_HASH);
});

test('GET /api/v1/summary with LEOZOPS key -> secure denial, no business execution', async () => {
  _resetPrismaOps();
  const res = await summaryRoute.GET(leozReq());
  assertSecureDenial(res, 'summary GET');
});

test('GET /api/v1/<resource> with LEOZOPS key -> secure denial, no business execution', async () => {
  _resetPrismaOps();
  const res = await collectionRoute.GET(leozReq(), { params: { resource: 'leads' } });
  assertSecureDenial(res, 'collection GET');
});

test('POST /api/v1/<resource> with LEOZOPS key -> secure denial, body never read', async () => {
  _resetPrismaOps();
  const res = await collectionRoute.POST(leozReq(), { params: { resource: 'leads' } });
  assertSecureDenial(res, 'collection POST');
});

test('GET /api/v1/<resource>/<id> with LEOZOPS key -> secure denial', async () => {
  _resetPrismaOps();
  const res = await itemRoute.GET(leozReq(), { params: { resource: 'leads', id: 'lead-1' } });
  assertSecureDenial(res, 'item GET');
});

test('PUT /api/v1/<resource>/<id> with LEOZOPS key -> secure denial, body never read', async () => {
  _resetPrismaOps();
  const res = await itemRoute.PUT(leozReq(), { params: { resource: 'leads', id: 'lead-1' } });
  assertSecureDenial(res, 'item PUT');
});

test('DELETE /api/v1/<resource>/<id> with LEOZOPS key -> secure denial', async () => {
  _resetPrismaOps();
  const res = await itemRoute.DELETE(leozReq(), { params: { resource: 'leads', id: 'lead-1' } });
  assertSecureDenial(res, 'item DELETE');
});

test('PATCH: no generic route exports a PATCH handler — nothing exists to execute', () => {
  // With no exported PATCH, Next answers 405 at the framework layer before any
  // application code (auth or business) can run.
  assert.equal(summaryRoute.PATCH, undefined);
  assert.equal(collectionRoute.PATCH, undefined);
  assert.equal(itemRoute.PATCH, undefined);
});

test('reverse direction: an app-style ApiKey (ak_...) never validates on the snapshot route', () => {
  const env = { LEOZOPS_SNAPSHOT_ENABLED: 'true', LEOZOPS_READ_KEY_HASH: KEY_HASH };
  const appKeyReq = raw => ({ headers: { get: n => (n.toLowerCase() === 'authorization' ? 'Bearer ' + raw : null) } });
  assert.equal(verifyReadKey(appKeyReq('ak_' + 'f'.repeat(40)), env).ok, false);
  assert.equal(verifyReadKey(appKeyReq('ak_deadbeefdeadbeef'), env).ok, false);
  // and with no env hash deployed the LEOZOPS key itself has zero ambient power
  assert.equal(verifyReadKey(appKeyReq(LEOZOPS_KEY), {}).ok, false);
});
