import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadBrief } from '../lib/leozops/brief-projector.js';
import {
  LEOZOPS_PROPOSAL_CONTRACT,
  LEOZOPS_PROPOSAL_VERSION,
  LeozOpsProposalError,
  normalizeLeadActionProposal,
  serializeLeadActionProposal,
} from '../lib/leozops/proposal-contract.js';

const NOW = '2026-07-29T12:00:00.000Z';
const LEADS = [
  { id: 'lead-safe-1', source: null, value: 100, stage: 'new', ownerId: null, createdAt: '2026-07-01', expectedClose: null },
  { id: 'lead-safe-2', source: 'referral', value: 200, stage: 'proposal', ownerId: 'private-owner', createdAt: '2026-06-01', expectedClose: '2026-07-10' },
];

const brief = () => buildLeadBrief(LEADS, { generatedAt: NOW, asOf: '2026-07-29' });

function validInput(current = brief(), type = 'unassigned_active_leads') {
  const signal = current.signals.find(item => item.type === type);
  const reason = {
    unassigned_active_leads: 'assignment_review',
    overdue_expected_close: 'sla_review',
    late_stage_missing_close: 'data_quality_review',
    aging_active_leads: 'follow_up_review',
    missing_lead_source: 'data_quality_review',
    unknown_funnel_stage: 'data_quality_review',
    no_active_leads: 'sync_review',
  }[type];
  return {
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: LEOZOPS_PROPOSAL_VERSION,
    brief_id: current.brief_id,
    signal_id: signal.signal_id,
    action_type: signal.proposal.action_type,
    reason_code: reason,
    lead_refs: signal.evidence.sample_external_ids,
  };
}

test('normalizes a current evidence-bound proposal deterministically', () => {
  const current = brief();
  const one = normalizeLeadActionProposal(validInput(current), current);
  const two = normalizeLeadActionProposal(validInput(current), current);
  assert.equal(one.payloadHash, two.payloadHash);
  assert.equal(one.evidenceHash, two.evidenceHash);
  assert.equal(one.briefId, current.brief_id);
  assert.deepEqual(one.leadRefs, ['lead-safe-1']);
  assert.equal(one.expiresAt.toISOString(), '2026-07-30T00:00:00.000Z');
});

test('rejects unknown fields and unsupported contracts', () => {
  const current = brief();
  assert.throws(
    () => normalizeLeadActionProposal({ ...validInput(current), email: 'victim@example.com' }, current),
    error => error instanceof LeozOpsProposalError && error.code === 'leozops_proposal_unknown_field',
  );
  assert.throws(
    () => normalizeLeadActionProposal({ ...validInput(current), version: 2 }, current),
    error => error.code === 'leozops_proposal_contract_unsupported',
  );
  assert.throws(
    () => normalizeLeadActionProposal({ ...validInput(current), version: '1' }, current),
    error => error.code === 'leozops_proposal_contract_unsupported',
  );
});

test('rejects stale brief, stale signal, wrong action and wrong reason', () => {
  const current = brief();
  const valid = validInput(current);
  const cases = [
    [{ ...valid, brief_id: `sha256:${'0'.repeat(64)}` }, 'leozops_proposal_brief_stale'],
    [{ ...valid, signal_id: `sha256:${'1'.repeat(64)}` }, 'leozops_proposal_signal_stale'],
    [{ ...valid, action_type: 'send_email' }, 'leozops_proposal_action_mismatch'],
    [{ ...valid, reason_code: 'because_ai_said_so' }, 'leozops_proposal_reason_invalid'],
  ];
  for (const [input, code] of cases) {
    assert.throws(() => normalizeLeadActionProposal(input, current), error => error.code === code, code);
  }
});

test('lead references must be unique and must come from current signal evidence', () => {
  const current = brief();
  const valid = validInput(current);
  assert.throws(
    () => normalizeLeadActionProposal({ ...valid, lead_refs: ['lead-safe-1', 'lead-safe-1'] }, current),
    error => error.code === 'leozops_proposal_lead_refs_duplicate',
  );
  assert.throws(
    () => normalizeLeadActionProposal({ ...valid, lead_refs: ['unknown-lead'] }, current),
    error => error.code === 'leozops_proposal_evidence_mismatch',
  );
});

test('serialized proposal explicitly cannot approve or execute work', () => {
  const current = brief();
  const draft = normalizeLeadActionProposal(validInput(current), current);
  const output = serializeLeadActionProposal({
    id: 'proposal_1',
    status: 'proposed',
    briefId: draft.briefId,
    sourceSnapshotId: draft.sourceSnapshotId,
    signalId: draft.signalId,
    signalType: draft.signalType,
    actionType: draft.actionType,
    reasonCode: draft.reasonCode,
    leadRefs: JSON.stringify(draft.leadRefs),
    evidenceHash: draft.evidenceHash,
    payloadHash: draft.payloadHash,
    createdAt: new Date(NOW),
    expiresAt: draft.expiresAt,
  }, { now: new Date(NOW) });
  assert.equal(output.proposal.status, 'proposed');
  assert.deepEqual(output.proposal.approval, { required: true, status: 'not_started' });
  assert.deepEqual(output.proposal.execution, { allowed: false, status: 'not_started', receipt_id: null });
  assert.ok(!JSON.stringify(output).includes('success'));
});

test('a proposal becomes expired when its daily brief window closes', () => {
  const current = brief();
  const draft = normalizeLeadActionProposal(validInput(current), current);
  const output = serializeLeadActionProposal({
    id: 'proposal_1', status: 'proposed', ...draft,
    leadRefs: JSON.stringify(draft.leadRefs), createdAt: new Date(NOW),
  }, { now: new Date('2026-07-30T00:00:00.000Z') });
  assert.equal(output.proposal.status, 'expired');
  assert.equal(output.proposal.stored_status, 'proposed');
  assert.equal(output.proposal.next_state, 'refresh_brief');
});

test('corrupt stored references cannot retain a proposed effective state', () => {
  const current = brief();
  const draft = normalizeLeadActionProposal(validInput(current), current);
  const output = serializeLeadActionProposal({
    id: 'proposal_corrupt', status: 'proposed', ...draft,
    leadRefs: '["duplicate","duplicate"]', createdAt: new Date(NOW),
  }, { now: new Date(NOW) });
  assert.equal(output.proposal.status, 'invalid');
  assert.equal(output.proposal.stored_status, 'invalid');
  assert.deepEqual(output.proposal.lead_refs, []);
});
