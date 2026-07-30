import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadBrief } from '../lib/leozops/brief-projector.js';
import { createLeadActionProposal } from '../lib/leozops/proposal-admin.js';
import { LEOZOPS_PROPOSAL_CONTRACT, normalizeLeadActionProposal } from '../lib/leozops/proposal-contract.js';
import { handleProposalReviewDecision, handleProposalReviewInbox } from '../lib/leozops/review-handler.js';
import { LEOZOPS_REVIEW_CONTRACT } from '../lib/leozops/review-contract.js';
import { _resetRateLimit } from '../lib/leozops/ratelimit.js';
import { createProposalDb } from './helpers/leozops-proposal-db.mjs';

const NOW = Date.parse('2026-07-29T12:00:00.000Z');
const UUID = '22222222-3333-4444-8555-666666666666';
const DIRECTOR = { id: 'director-solo-1', name: 'Solo Director', role: 'DIRECTOR' };
const STAFF = { id: 'staff-1', name: 'Staff', role: 'STAFF' };
const ON = { LEOZOPS_REVIEW_ENABLED: 'true' };
const LEADS = [
  { id: 'lead-safe-1', source: null, value: 100, stage: 'new', ownerId: null, createdAt: '2026-07-01', expectedClose: null },
];

async function setup() {
  const memory = createProposalDb();
  const brief = buildLeadBrief(LEADS, { generatedAt: new Date(NOW).toISOString(), asOf: '2026-07-29' });
  const signal = brief.signals.find(row => row.type === 'unassigned_active_leads');
  const draft = normalizeLeadActionProposal({
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: 1,
    brief_id: brief.brief_id,
    signal_id: signal.signal_id,
    action_type: signal.proposal.action_type,
    reason_code: 'assignment_review',
    lead_refs: signal.evidence.sample_external_ids,
  }, brief);
  await createLeadActionProposal(memory.db, {
    requesterFingerprint: 'proposal-scope-hash',
    correlationId: '11111111-2222-4333-8444-555555555555',
    idempotencyKey: 'proposal_review_handler_seed',
    draft,
    now: new Date(NOW),
  });
  return { ...memory, proposal: memory.state.proposals[0] };
}

function req({ method = 'GET', body = null, headers = {}, path = '/api/leozops/action-proposals' } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const all = { 'content-type': 'application/json', 'x-correlation-id': UUID, ...headers };
  return {
    method,
    url: `https://erp-egoric.vercel.app${path}`,
    headers: { get: name => all[name.toLowerCase()] ?? null },
    text: async () => raw,
  };
}

const accept = () => ({
  contract: LEOZOPS_REVIEW_CONTRACT,
  version: 1,
  decision: 'accept',
  reason_code: 'reviewed_current_evidence',
});

function baseOptions(memory, overrides = {}) {
  return {
    env: ON,
    db: memory.db,
    getUser: async () => DIRECTOR,
    loadLeads: async () => LEADS,
    now: () => NOW,
    uuid: () => UUID,
    log: () => {},
    ...overrides,
  };
}

test('review feature is default-off before session or database access', async () => {
  _resetRateLimit();
  const memory = await setup();
  let authCalled = false;
  const response = await handleProposalReviewInbox(req(), baseOptions(memory, {
    env: {}, getUser: async () => { authCalled = true; return DIRECTOR; },
  }));
  assert.equal(response.status, 404);
  assert.equal(authCalled, false);
});

test('inbox allows GET only and decision route allows POST only', async () => {
  _resetRateLimit();
  const memory = await setup();
  assert.equal((await handleProposalReviewInbox(req({ method: 'POST' }), baseOptions(memory))).status, 405);
  assert.equal((await handleProposalReviewDecision(req({ method: 'GET' }), baseOptions(memory, {
    proposalId: memory.proposal.id,
  }))).status, 405);
});

test('review APIs require a Director employee session', async () => {
  for (const user of [null, STAFF]) {
    _resetRateLimit();
    const memory = await setup();
    const response = await handleProposalReviewInbox(req(), baseOptions(memory, { getUser: async () => user }));
    assert.equal(response.status, user ? 403 : 401);
  }
});

test('valid accept revalidates live evidence and never returns execution authority', async () => {
  _resetRateLimit();
  const memory = await setup();
  let reads = 0;
  const response = await handleProposalReviewDecision(req({
    method: 'POST', body: accept(), path: `/api/leozops/action-proposals/${memory.proposal.id}/review`,
  }), baseOptions(memory, {
    proposalId: memory.proposal.id,
    loadLeads: async () => { reads += 1; return LEADS; },
  }));
  assert.equal(response.status, 201);
  assert.equal(reads, 1);
  assert.equal(response.body.proposal.review.status, 'accepted');
  assert.equal(response.body.proposal.execution.allowed, false);
  assert.equal(response.body.governance.grants_execution, false);
});

test('reject does not read Lead data', async () => {
  _resetRateLimit();
  const memory = await setup();
  const response = await handleProposalReviewDecision(req({
    method: 'POST',
    body: { contract: LEOZOPS_REVIEW_CONTRACT, version: 1, decision: 'reject', reason_code: 'not_actionable' },
  }), baseOptions(memory, {
    proposalId: memory.proposal.id,
    loadLeads: async () => { throw new Error('must not read leads'); },
  }));
  assert.equal(response.status, 201);
  assert.equal(response.body.proposal.review.status, 'rejected');
});

test('body content type, JSON and size are enforced', async () => {
  const cases = [
    [req({ method: 'POST', body: accept(), headers: { 'content-type': 'text/plain' } }), 415],
    [req({ method: 'POST', body: '{bad' }), 400],
    [req({ method: 'POST', body: 'x'.repeat(4097) }), 413],
  ];
  for (const [request, status] of cases) {
    _resetRateLimit();
    const memory = await setup();
    const response = await handleProposalReviewDecision(request, baseOptions(memory, { proposalId: memory.proposal.id }));
    assert.equal(response.status, status);
  }
});

test('source failures are generic and audit never contains Lead refs or error details', async () => {
  _resetRateLimit();
  const memory = await setup();
  const lines = [];
  const response = await handleProposalReviewDecision(req({ method: 'POST', body: accept() }), baseOptions(memory, {
    proposalId: memory.proposal.id,
    loadLeads: async () => { throw new Error('secret-database-dsn'); },
    log: line => lines.push(String(line)),
  }));
  assert.equal(response.status, 500);
  assert.equal(response.body.code, 'leozops_review_unavailable');
  assert.equal(lines.length, 1);
  for (const secret of ['secret-database-dsn', 'lead-safe-1', DIRECTOR.id, DIRECTOR.name]) {
    assert.ok(!JSON.stringify(response).includes(secret));
    assert.ok(!lines[0].includes(secret));
  }
});

test('review rate limit returns a stable 429 response', async () => {
  _resetRateLimit();
  const memory = await setup();
  const options = baseOptions(memory, { rateLimit: { limit: 1, windowMs: 3_600_000 } });
  assert.equal((await handleProposalReviewInbox(req(), options)).status, 200);
  const denied = await handleProposalReviewInbox(req(), options);
  assert.equal(denied.status, 429);
  assert.equal(denied.body.code, 'leozops_review_rate_limited');
});
