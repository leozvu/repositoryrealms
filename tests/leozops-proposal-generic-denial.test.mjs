// Prove the proposal write credential has no ambient application authority.

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
const proposalRoute = await import('../app/api/integrations/leozops/v1/action-proposals/route.js');
const humanReviewInboxRoute = await import('../app/api/leozops/action-proposals/route.js');
const humanReviewDecisionRoute = await import('../app/api/leozops/action-proposals/[id]/review/route.js');
const commandInboxRoute = await import('../app/api/leozops/command-intents/route.js');
const commandConfirmRoute = await import('../app/api/leozops/command-intents/[id]/confirm/route.js');
const commandRuntimeRoute = await import('../app/api/leozops/runtime/route.js');
const commandJobsRoute = await import('../app/api/leozops/jobs/run/route.js');

const KEY = 'lozk_live_proposal_denial_matrix_key';
const HASH = crypto.createHash('sha256').update(KEY).digest('hex');

process.env.LEOZOPS_PROPOSAL_ENABLED = 'true';
process.env.LEOZOPS_PROPOSAL_WRITE_KEY_HASH = HASH;
process.env.LEOZOPS_REVIEW_ENABLED = 'true';
process.env.LEOZOPS_COMMAND_ENABLED = 'true';
process.env.LEOZOPS_CRON_SECRET = 'cron-secret-that-is-distinct-and-long-enough';

const request = (method = 'GET', url = 'https://erp-egoric.vercel.app/api/v1/summary', key = KEY) => ({
  method,
  url,
  headers: { get: name => (name.toLowerCase() === 'authorization' ? `Bearer ${key}` : null) },
  json: async () => { throw new Error('business body read'); },
  text: async () => { throw new Error('business body read'); },
});

function assertOnlyGenericAuthLookup(label) {
  assert.ok(prismaOps.length >= 1, `${label}: missing generic auth lookup`);
  for (const op of prismaOps) {
    assert.equal(op.call, 'apiKey.findUnique', `${label}: unexpected business DB call ${op.call}`);
    assert.equal(op.args[0]?.where?.keyHash, HASH);
  }
}

test('proposal credential resolves to no generic application user', async () => {
  _resetPrismaOps();
  assert.equal(await apiUser(request()), null);
  assertOnlyGenericAuthLookup('apiUser');
});

test('proposal credential is denied by generic API routes before business work', async () => {
  _resetPrismaOps();
  const summary = await summaryRoute.GET(request());
  assert.ok(summary.status === 401 || summary.status === 403);
  assertOnlyGenericAuthLookup('summary');

  _resetPrismaOps();
  const collection = await collectionRoute.POST(
    request('POST', 'https://erp-egoric.vercel.app/api/v1/leads'),
    { params: { resource: 'leads' } },
  );
  assert.ok(collection.status === 401 || collection.status === 403);
  assertOnlyGenericAuthLookup('collection');
});

test('proposal credential is not an employee session on /api/data', async () => {
  _resetPrismaOps();
  const response = await dataCollectionRoute.GET(
    request('GET', 'https://erp-egoric.vercel.app/api/data/leads'),
    { params: { resource: 'leads' } },
  );
  assert.equal(response.status, 401);
  assert.equal(prismaOps.length, 0);
});

test('actual proposal route denies read credentials and explicitly exports forbidden methods', async () => {
  for (const key of ['lozk_snapshot_read_key', 'lozk_brief_read_key']) {
    _resetPrismaOps();
    const response = await proposalRoute.GET(request(
      'GET',
      'https://erp-egoric.vercel.app/api/integrations/leozops/v1/action-proposals',
      key,
    ));
    assert.equal(response.status, 401);
    assert.equal(prismaOps.length, 0);
  }

  for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const handler = proposalRoute[method];
    assert.equal(typeof handler, 'function', `${method}: explicit export required`);
    const response = await handler(request(
      method,
      'https://erp-egoric.vercel.app/api/integrations/leozops/v1/action-proposals',
    ));
    assert.equal(response.status, 405, method);
  }
});

test('proposal bearer credential cannot become a Director review session', async () => {
  _resetPrismaOps();
  const inbox = await humanReviewInboxRoute.GET(request(
    'GET',
    'https://erp-egoric.vercel.app/api/leozops/action-proposals',
  ));
  assert.equal(inbox.status, 401);
  assert.equal(prismaOps.length, 0, 'session denial must happen before proposal storage access');

  _resetPrismaOps();
  const decision = await humanReviewDecisionRoute.POST(request(
    'POST',
    'https://erp-egoric.vercel.app/api/leozops/action-proposals/proposal_1/review',
  ), { params: { id: 'proposal_1' } });
  assert.equal(decision.status, 401);
  assert.equal(prismaOps.length, 0, 'session denial must happen before body or storage access');
});

test('proposal bearer credential cannot become a Director command session or cron credential', async () => {
  const sessionCalls = [
    ['inbox', () => commandInboxRoute.GET(request('GET', 'https://erp-egoric.vercel.app/api/leozops/command-intents'))],
    ['confirmation', () => commandConfirmRoute.POST(
      request('POST', 'https://erp-egoric.vercel.app/api/leozops/command-intents/intent_1/confirm'),
      { params: Promise.resolve({ id: 'intent_1' }) },
    )],
    ['runtime', () => commandRuntimeRoute.GET(request('GET', 'https://erp-egoric.vercel.app/api/leozops/runtime'))],
    ['manual jobs', () => commandJobsRoute.POST(request('POST', 'https://erp-egoric.vercel.app/api/leozops/jobs/run'))],
  ];
  for (const [label, call] of sessionCalls) {
    _resetPrismaOps();
    const response = await call();
    assert.equal(response.status, 401, label);
    assert.equal(prismaOps.length, 0, `${label}: session denial must precede command storage access`);
  }
  _resetPrismaOps();
  const cron = await commandJobsRoute.GET(request('GET', 'https://erp-egoric.vercel.app/api/leozops/jobs/run'));
  assert.equal(cron.status, 401);
  assert.equal(prismaOps.length, 0, 'cron denial must precede job storage access');
});
