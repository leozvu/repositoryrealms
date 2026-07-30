import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadBrief } from '../lib/leozops/brief-projector.js';
import { createLeadActionProposal, listLeadActionProposals } from '../lib/leozops/proposal-admin.js';
import { LEOZOPS_PROPOSAL_CONTRACT, normalizeLeadActionProposal } from '../lib/leozops/proposal-contract.js';
import {
  LEOZOPS_REVIEW_CONTRACT,
  LEOZOPS_REVIEW_GOVERNANCE_MODE,
} from '../lib/leozops/review-contract.js';
import { listLeadActionProposalReviews, reviewLeadActionProposal } from '../lib/leozops/review-admin.js';
import { createProposalDb } from './helpers/leozops-proposal-db.mjs';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const DIRECTOR = { id: 'director-solo-1', name: 'Solo Director', role: 'DIRECTOR' };
const STAFF = { id: 'staff-1', name: 'Staff', role: 'STAFF' };
const LEADS = [
  { id: 'lead-safe-1', source: null, value: 100, stage: 'new', ownerId: null, createdAt: '2026-07-01', expectedClose: null },
];

function currentBrief(leads = LEADS) {
  return buildLeadBrief(leads, { generatedAt: NOW.toISOString(), asOf: '2026-07-29' });
}

async function setup() {
  const memory = createProposalDb();
  const brief = currentBrief();
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
    idempotencyKey: 'proposal_review_seed_0001',
    draft,
    now: NOW,
  });
  return { ...memory, brief, proposal: memory.state.proposals[0] };
}

const acceptInput = () => ({
  contract: LEOZOPS_REVIEW_CONTRACT,
  version: 1,
  decision: 'accept',
  reason_code: 'reviewed_current_evidence',
});

const rejectInput = reason => ({
  contract: LEOZOPS_REVIEW_CONTRACT,
  version: 1,
  decision: 'reject',
  reason_code: reason,
});

test('only a Director session can review a proposal', async () => {
  const { db, brief, proposal } = await setup();
  await assert.rejects(() => reviewLeadActionProposal(db, STAFF, {
    proposalId: proposal.id,
    correlationId: '22222222-3333-4444-8555-666666666666',
    input: acceptInput(),
    currentBrief: brief,
    now: NOW,
  }), error => error.code === 'leozops_review_director_required');
});

test('accept appends one review and audit without changing or executing the proposal', async () => {
  const { db, state, brief, proposal } = await setup();
  const before = { ...proposal };
  const output = await reviewLeadActionProposal(db, DIRECTOR, {
    proposalId: proposal.id,
    correlationId: '22222222-3333-4444-8555-666666666666',
    input: acceptInput(),
    currentBrief: brief,
    now: NOW,
  });
  assert.equal(output.proposal.review.status, 'accepted');
  assert.equal(output.proposal.approval.status, 'not_started');
  assert.equal(output.proposal.execution.allowed, false);
  assert.equal(output.governance.solo_operator, true);
  assert.equal(output.governance.four_eyes_verified, false);
  assert.deepEqual(state.proposals[0], before);
  assert.equal(state.reviews.length, 1);
  assert.equal(state.audits.length, 2);
  const reviewAudit = JSON.stringify(state.audits[1]);
  assert.ok(reviewAudit.includes('execution=false'));
  assert.ok(!reviewAudit.includes('lead-safe-1'));
});

test('accept fails when live Brief evidence has changed', async () => {
  const { db, state, proposal } = await setup();
  const changed = currentBrief([{ ...LEADS[0], ownerId: 'now-assigned' }]);
  await assert.rejects(() => reviewLeadActionProposal(db, DIRECTOR, {
    proposalId: proposal.id,
    correlationId: '22222222-3333-4444-8555-666666666666',
    input: acceptInput(),
    currentBrief: changed,
    now: NOW,
  }), error => error.code === 'leozops_review_proposal_stale');
  assert.equal(state.reviews.length, 0);
});

test('expired proposals cannot receive a review decision', async () => {
  const { db, proposal, brief } = await setup();
  await assert.rejects(() => reviewLeadActionProposal(db, DIRECTOR, {
    proposalId: proposal.id,
    correlationId: '22222222-3333-4444-8555-666666666666',
    input: acceptInput(),
    currentBrief: brief,
    now: new Date('2026-07-30T00:00:00.000Z'),
  }), error => error.code === 'leozops_review_proposal_expired');
});

test('reject uses an allowlisted reason and does not require live source reads', async () => {
  const { db, proposal } = await setup();
  const output = await reviewLeadActionProposal(db, DIRECTOR, {
    proposalId: proposal.id,
    correlationId: '22222222-3333-4444-8555-666666666666',
    input: rejectInput('not_actionable'),
    currentBrief: null,
    now: NOW,
  });
  assert.equal(output.proposal.review.status, 'rejected');
  assert.equal(output.proposal.next_state, 'proposal_closed');
  assert.equal(output.proposal.execution.allowed, false);
});

test('exact repeated decision replays while a conflicting decision is rejected', async () => {
  const { db, state, proposal } = await setup();
  const args = {
    proposalId: proposal.id,
    correlationId: '22222222-3333-4444-8555-666666666666',
    input: rejectInput('outside_current_priority'),
    now: NOW,
  };
  await reviewLeadActionProposal(db, DIRECTOR, args);
  const replay = await reviewLeadActionProposal(db, DIRECTOR, { ...args, correlationId: '33333333-4444-4555-8666-777777777777' });
  assert.equal(replay.replayed, true);
  assert.equal(state.reviews.length, 1);
  await assert.rejects(() => reviewLeadActionProposal(db, DIRECTOR, {
    ...args,
    input: rejectInput('not_actionable'),
  }), error => error.code === 'leozops_review_conflict');
});

test('Director inbox and external proposal view expose decision but no reviewer identity', async () => {
  const { db, proposal } = await setup();
  await reviewLeadActionProposal(db, DIRECTOR, {
    proposalId: proposal.id,
    correlationId: '22222222-3333-4444-8555-666666666666',
    input: rejectInput('duplicate_or_superseded'),
    now: NOW,
  });
  const inbox = await listLeadActionProposalReviews(db, DIRECTOR, { now: NOW });
  assert.equal(inbox.summary.rejected, 1);
  assert.equal(inbox.pending.length, 0);
  assert.equal(inbox.recent[0].review.status, 'rejected');
  assert.equal(inbox.governance.mode, LEOZOPS_REVIEW_GOVERNANCE_MODE);
  const external = await listLeadActionProposals(db, {
    requesterFingerprint: 'proposal-scope-hash', now: NOW,
  });
  const serialized = JSON.stringify(external);
  assert.equal(external.proposals[0].review.status, 'rejected');
  assert.ok(!serialized.includes(DIRECTOR.id));
  assert.ok(!serialized.includes(DIRECTOR.name));
});
