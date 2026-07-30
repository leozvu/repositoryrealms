import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadBrief } from '../lib/leozops/brief-projector.js';
import {
  LEOZOPS_PROPOSAL_CONTRACT,
  normalizeLeadActionProposal,
} from '../lib/leozops/proposal-contract.js';
import { createLeadActionProposal, listLeadActionProposals } from '../lib/leozops/proposal-admin.js';
import { createProposalDb } from './helpers/leozops-proposal-db.mjs';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const brief = buildLeadBrief([
  { id: 'lead-ref-1', source: null, value: 100, stage: 'new', ownerId: null, createdAt: '2026-07-01', expectedClose: null },
], { generatedAt: NOW.toISOString(), asOf: '2026-07-29' });
const signal = brief.signals.find(item => item.type === 'unassigned_active_leads');
const draft = normalizeLeadActionProposal({
  contract: LEOZOPS_PROPOSAL_CONTRACT,
  version: 1,
  brief_id: brief.brief_id,
  signal_id: signal.signal_id,
  action_type: signal.proposal.action_type,
  reason_code: 'assignment_review',
  lead_refs: signal.evidence.sample_external_ids,
}, brief);

const args = (overrides = {}) => ({
  requesterFingerprint: '12345678',
  correlationId: '11111111-2222-4333-8444-555555555555',
  idempotencyKey: 'idem_proposal_00000001',
  draft,
  now: NOW,
  ...overrides,
});

test('atomically creates one proposal and one payload-free audit record', async () => {
  const { db, state } = createProposalDb();
  const output = await createLeadActionProposal(db, args());
  assert.equal(output.proposal.status, 'proposed');
  assert.equal(output.proposal.execution.allowed, false);
  assert.equal(state.proposals.length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.proposals[0].idempotencyKeyHash.length, 64);
  const audit = JSON.stringify(state.audits[0]);
  assert.ok(!audit.includes('idem_proposal_00000001'));
  assert.ok(!audit.includes('lead-ref-1'));
});

test('same idempotency key and correlation replays without duplicate writes', async () => {
  const { db, state } = createProposalDb();
  await createLeadActionProposal(db, args());
  const replay = await createLeadActionProposal(db, args());
  assert.equal(replay.proposal.replayed, true);
  assert.equal(state.proposals.length, 1);
  assert.equal(state.audits.length, 1);
});

test('idempotency key and correlation cannot be reused for different proposals', async () => {
  const { db } = createProposalDb();
  await createLeadActionProposal(db, args());
  await assert.rejects(
    () => createLeadActionProposal(db, args({
      draft: { ...draft, payloadHash: 'different' },
    })),
    error => error.code === 'leozops_proposal_idempotency_conflict',
  );
  await assert.rejects(
    () => createLeadActionProposal(db, args({
      idempotencyKey: 'idem_proposal_00000002',
    })),
    error => error.code === 'leozops_proposal_idempotency_conflict',
  );
});

test('listing is scoped to the authenticated proposal-key fingerprint', async () => {
  const { db } = createProposalDb();
  await createLeadActionProposal(db, args());
  await createLeadActionProposal(db, args({
    requesterFingerprint: '87654321',
    correlationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    idempotencyKey: 'idem_proposal_00000002',
  }));
  const own = await listLeadActionProposals(db, { requesterFingerprint: '12345678', now: NOW });
  assert.equal(own.proposals.length, 1);
  assert.equal(own.proposals[0].id, 'proposal_1');
  assert.equal((await listLeadActionProposals(db, {
    requesterFingerprint: '12345678', proposalId: 'proposal_2', now: NOW,
  })).proposals.length, 0);
});
