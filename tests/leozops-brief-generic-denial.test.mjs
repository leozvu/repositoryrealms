// Sprint 1B — prove the brief credential has no ambient app/API authority.

import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

register('./helpers/leozops-esm-loader.mjs', import.meta.url);

const { prismaOps, _resetPrismaOps } = await import('./helpers/stub-prisma-client.mjs');
const { apiUser } = await import('../lib/apiauth.js');
const summaryRoute = await import('../app/api/v1/summary/route.js');
const collectionRoute = await import('../app/api/v1/[resource]/route.js');
const dataCollectionRoute = await import('../app/api/data/[resource]/route.js');
const briefRoute = await import('../app/api/integrations/leozops/v1/lead-brief/route.js');

const BRIEF_KEY = 'lozk_live_brief_denial_matrix_key';
const BRIEF_HASH = crypto.createHash('sha256').update(BRIEF_KEY).digest('hex');

process.env.LEOZOPS_BRIEF_ENABLED = 'true';
process.env.LEOZOPS_BRIEF_READ_KEY_HASH = BRIEF_HASH;

const request = (method = 'GET', url = 'https://erp-egoric.vercel.app/api/v1/summary') => ({
  method,
  url,
  headers: { get: name => (name.toLowerCase() === 'authorization' ? `Bearer ${BRIEF_KEY}` : null) },
  json: async () => { throw new Error('business handler executed: body was read'); },
});

function assertOnlyGenericAuthLookup(label) {
  assert.ok(prismaOps.length >= 1, `${label}: missing generic auth lookup`);
  for (const op of prismaOps) {
    assert.equal(op.call, 'apiKey.findUnique', `${label}: unexpected business DB call ${op.call}`);
    assert.equal(op.args[0]?.where?.keyHash, BRIEF_HASH);
  }
}

test('apiUser resolves the separate brief credential to no application user', async () => {
  _resetPrismaOps();
  assert.equal(await apiUser(request()), null);
  assertOnlyGenericAuthLookup('apiUser');
});

test('brief credential is denied by the real generic summary route', async () => {
  _resetPrismaOps();
  const response = await summaryRoute.GET(request());
  assert.ok(response.status === 401 || response.status === 403);
  assertOnlyGenericAuthLookup('summary');
});

test('brief credential is denied before generic collection business logic reads the body', async () => {
  _resetPrismaOps();
  const response = await collectionRoute.POST(
    request('POST', 'https://erp-egoric.vercel.app/api/v1/leads'),
    { params: { resource: 'leads' } },
  );
  assert.ok(response.status === 401 || response.status === 403);
  assertOnlyGenericAuthLookup('collection');
});

test('brief credential is not a NextAuth employee session on /api/data', async () => {
  _resetPrismaOps();
  const response = await dataCollectionRoute.GET(
    request('GET', 'https://erp-egoric.vercel.app/api/data/leads'),
    { params: { resource: 'leads' } },
  );
  assert.equal(response.status, 401);
  assert.equal(prismaOps.length, 0, 'session denial must happen before operational DB access');
});

test('actual brief route accepts GET and explicitly rejects every non-GET method', async () => {
  _resetPrismaOps();
  const getResponse = await briefRoute.GET(request(
    'GET',
    'https://erp-egoric.vercel.app/api/integrations/leozops/v1/lead-brief',
  ));
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.limitations.executable_actions, false);

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const handler = briefRoute[method];
    assert.equal(typeof handler, 'function', `${method}: explicit export required`);
    const response = await handler(request(
      method,
      'https://erp-egoric.vercel.app/api/integrations/leozops/v1/lead-brief',
    ));
    assert.equal(response.status, 405, method);
  }
});
