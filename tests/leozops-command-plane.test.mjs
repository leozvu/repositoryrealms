import assert from 'node:assert/strict';
import test from 'node:test';
import { executeRepositoryRealmsAction } from '../lib/repository-realms.js';
import { buildLeadBrief } from '../lib/leozops/brief-projector.js';
import {
  confirmLeozOpsCommand,
  prepareLeozOpsCommand,
} from '../lib/leozops/command-admin.js';
import {
  LEOZOPS_COMMAND_CONFIRM_CONTRACT,
  LEOZOPS_COMMAND_CONTRACT,
  LEOZOPS_RUNTIME_CONTRACT,
  capabilityById,
} from '../lib/leozops/command-contract.js';
import { runDueLeozOpsJobs } from '../lib/leozops/job-admin.js';
import { LEOZOPS_PROPOSAL_CONTRACT, normalizeLeadActionProposal } from '../lib/leozops/proposal-contract.js';
import { LEOZOPS_REVIEW_GOVERNANCE_MODE } from '../lib/leozops/review-contract.js';
import {
  assertLeozOpsExecutionAvailable,
  consumeLeozOpsActionBudget,
  updateLeozOpsRuntime,
} from '../lib/leozops/runtime-admin.js';
import { createCommandDb } from './helpers/leozops-command-db.mjs';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const DIRECTOR = {
  id: 'director-solo-1', name: 'Solo Director', role: 'DIRECTOR', roles: ['DIRECTOR'],
  status: 'active', teamId: null, userType: 'internal',
};
const ENV = {
  LEOZOPS_COMMAND_ENABLED: 'true',
  LEOZOPS_EXECUTION_ENABLED: 'true',
  LEOZOPS_CONFIRMATION_SECRET: 'test-only-confirmation-secret-32-chars-long',
  LEOZOPS_CAP_FOLLOWUP_ENABLED: 'true',
  LEOZOPS_CAP_EXPECTED_CLOSE_ENABLED: 'true',
  LEOZOPS_CAP_SOURCE_ENABLED: 'true',
};

function setup({ signalType = 'aging_active_leads', lead = {} } = {}) {
  const liveLead = {
    id: 'lead-safe-1', source: null, value: 100, stage: 'new', ownerId: null,
    createdAt: '2026-07-01', expectedClose: null, ...lead,
  };
  const brief = buildLeadBrief([liveLead], { generatedAt: NOW.toISOString(), asOf: '2026-07-29' });
  const signal = brief.signals.find(row => row.type === signalType);
  const reasonBySignal = {
    aging_active_leads: 'follow_up_review',
    overdue_expected_close: 'sla_review',
    late_stage_missing_close: 'data_quality_review',
    missing_lead_source: 'data_quality_review',
  };
  const draft = normalizeLeadActionProposal({
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: 1,
    brief_id: brief.brief_id,
    signal_id: signal.signal_id,
    action_type: signal.proposal.action_type,
    reason_code: reasonBySignal[signalType],
    lead_refs: signal.evidence.sample_external_ids,
  }, brief);
  const proposal = {
    id: 'proposal_1', briefId: draft.briefId, signalId: draft.signalId,
    actionType: draft.actionType, reasonCode: draft.reasonCode,
    leadRefs: JSON.stringify(draft.leadRefs), payloadHash: draft.payloadHash,
    evidenceHash: draft.evidenceHash, status: 'proposed', expiresAt: draft.expiresAt,
    createdAt: NOW,
  };
  const review = {
    id: 'review_1', proposalId: proposal.id, decision: 'accept',
    reasonCode: 'reviewed_current_evidence', governanceMode: LEOZOPS_REVIEW_GOVERNANCE_MODE,
    proposalPayloadHash: proposal.payloadHash, reviewerId: DIRECTOR.id, reviewedAt: NOW,
  };
  const runtime = {
    id: 'global', executionEnabled: true, killSwitchActive: false, dailyActionLimit: 5,
    circuitState: 'closed', consecutiveFailures: 0, circuitOpenedAt: null,
    circuitRetryAt: null, recordVersion: 1,
  };
  const memory = createCommandDb({
    proposals: [proposal], reviews: [review], leads: [liveLead],
    runtimes: [runtime], users: [DIRECTOR],
  });
  return { ...memory, brief, proposal, review, lead: liveLead };
}

async function prepare(memory, capability = 'lead.followup.create', parameters = {
  kind: 'call', title: 'Theo dõi tiến độ lead', date: '2026-07-30',
}) {
  return prepareLeozOpsCommand(memory.db, DIRECTOR, {
    contract: LEOZOPS_COMMAND_CONTRACT, version: 1,
    proposal_id: memory.proposal.id, capability,
    target_ref: memory.lead.id, parameters,
  }, {
    currentBrief: memory.brief,
    idempotencyKey: 'leozops_command_idempotency_0001',
    correlationId: '11111111-2222-4333-8444-555555555555',
    env: ENV, now: NOW,
  });
}

test('dry-run is evidence-bound, idempotent and creates no business mutation', async () => {
  const memory = setup();
  const first = await prepare(memory);
  const replay = await prepare(memory);
  assert.equal(first.intent.status, 'prepared');
  assert.equal(first.intent.preview.operation, 'create');
  assert.equal(replay.intent.replayed, true);
  assert.equal(replay.confirmation_token, first.confirmation_token);
  assert.equal(memory.state.intents.length, 1);
  assert.equal(memory.state.activities.length, 0);
  assert.equal(memory.state.receipts.length, 0);
  assert.deepEqual(memory.state.leads[0], memory.lead);
  assert.ok(!JSON.stringify(memory.state.audits).includes(memory.lead.id));
});

test('explicit confirmation only enqueues; worker delegates once and reconciles canonical receipt', async () => {
  const memory = setup();
  const prepared = await prepare(memory);
  const confirmed = await confirmLeozOpsCommand(memory.db, DIRECTOR, {
    contract: LEOZOPS_COMMAND_CONFIRM_CONTRACT, version: 1,
    intent_id: prepared.intent.id, confirmation_token: prepared.confirmation_token, confirm: true,
  }, { env: ENV, now: NOW });
  assert.equal(confirmed.intent.status, 'confirmed');
  assert.equal(memory.state.jobs.length, 1);
  assert.equal(memory.state.activities.length, 0);
  assert.equal(memory.state.receipts.length, 0);

  const run = await runDueLeozOpsJobs(memory.db, {
    env: ENV, now: NOW, uuid: () => 'lease_1', maxJobs: 10,
  });
  assert.deepEqual({ claimed: run.claimed, succeeded: run.succeeded, failed: run.failed }, { claimed: 1, succeeded: 1, failed: 0 });
  assert.equal(memory.state.activities.length, 1);
  assert.equal(memory.state.receipts.length, 1);
  assert.equal(memory.state.intents[0].status, 'succeeded');
  assert.equal(memory.state.intents[0].repositoryReceiptId, memory.state.receipts[0].id);
  assert.equal(memory.state.jobs[0].status, 'succeeded');
  const second = await runDueLeozOpsJobs(memory.db, { env: ENV, now: NOW, uuid: () => 'lease_2' });
  assert.equal(second.claimed, 0);
  assert.equal(memory.state.activities.length, 1);
});

test('stale evidence and invalid confirmation fail before mutation or queueing', async () => {
  const memory = setup();
  const changedBrief = buildLeadBrief([{ ...memory.lead, ownerId: 'new-owner' }], {
    generatedAt: NOW.toISOString(), asOf: '2026-07-29',
  });
  await assert.rejects(() => prepareLeozOpsCommand(memory.db, DIRECTOR, {
    contract: LEOZOPS_COMMAND_CONTRACT, version: 1,
    proposal_id: memory.proposal.id, capability: 'lead.followup.create', target_ref: memory.lead.id,
    parameters: { kind: 'call', title: 'Theo dõi tiến độ lead', date: '2026-07-30' },
  }, {
    currentBrief: changedBrief, idempotencyKey: 'leozops_command_idempotency_0002',
    correlationId: '22222222-3333-4444-8555-666666666666', env: ENV, now: NOW,
  }), error => error.code === 'leozops_command_proposal_stale');
  const prepared = await prepare(memory);
  await assert.rejects(() => confirmLeozOpsCommand(memory.db, DIRECTOR, {
    contract: LEOZOPS_COMMAND_CONFIRM_CONTRACT, version: 1,
    intent_id: prepared.intent.id, confirmation_token: 'z'.repeat(32), confirm: true,
  }, { env: ENV, now: NOW }), error => error.code === 'leozops_command_confirmation_invalid');
  assert.equal(memory.state.jobs.length, 0);
  assert.equal(memory.state.activities.length, 0);
});

test('tampered preview and mismatched canonical receipt fail closed', async () => {
  const tampered = setup();
  const prepared = await prepare(tampered);
  tampered.state.intents[0].preview = JSON.stringify({
    ...JSON.parse(tampered.state.intents[0].preview), before: { scheduled_followup: true },
  });
  await assert.rejects(() => confirmLeozOpsCommand(tampered.db, DIRECTOR, {
    contract: LEOZOPS_COMMAND_CONFIRM_CONTRACT, version: 1,
    intent_id: prepared.intent.id, confirmation_token: prepared.confirmation_token, confirm: true,
  }, { env: ENV, now: NOW }), error => error.code === 'leozops_command_integrity_invalid');
  assert.equal(tampered.state.jobs.length, 0);

  const conflict = setup();
  const preparedConflict = await prepare(conflict);
  await confirmLeozOpsCommand(conflict.db, DIRECTOR, {
    contract: LEOZOPS_COMMAND_CONFIRM_CONTRACT, version: 1,
    intent_id: preparedConflict.intent.id, confirmation_token: preparedConflict.confirmation_token, confirm: true,
  }, { env: ENV, now: NOW });
  const intent = conflict.state.intents[0];
  conflict.state.receipts.push({
    id: 'receipt_conflict', idempotencyKey: intent.repositoryIdempotencyKey,
    userId: DIRECTOR.id, action: intent.capability, resource: 'activities', entityId: intent.targetRef,
    fromState: 'none', toState: 'created', resultId: 'activity_wrong', payloadHash: '0'.repeat(64),
  });
  const run = await runDueLeozOpsJobs(conflict.db, { env: ENV, now: NOW, uuid: () => 'lease_conflict' });
  assert.equal(run.failed, 1);
  assert.equal(conflict.state.intents[0].lastErrorCode, 'leozops_command_receipt_conflict');
  assert.equal(conflict.state.activities.length, 0);
});

test('guarded Lead mutations use RepositoryRealms CAS, receipt and idempotent replay', async () => {
  const memory = setup();
  const input = {
    action: 'lead.source.update', entityId: memory.lead.id,
    expectedSource: null, source: 'website', idempotencyKey: 'repository-realms:source:0001',
  };
  const first = await executeRepositoryRealmsAction(memory.db, DIRECTOR, input, { now: NOW });
  const replay = await executeRepositoryRealmsAction(memory.db, DIRECTOR, input, { now: NOW });
  assert.equal(first.repository.receiptId, memory.state.receipts[0].id);
  assert.equal(replay.repository.replayed, true);
  assert.equal(memory.state.leads[0].source, 'website');
  assert.equal(memory.state.receipts.length, 1);
  await assert.rejects(() => executeRepositoryRealmsAction(memory.db, DIRECTOR, {
    action: 'lead.expected_close.update', entityId: memory.lead.id,
    expectedCloseAt: '2026-07-28', closeAt: '2026-08-02', idempotencyKey: 'repository-realms:close:0001',
  }), error => error.code === 'realm_action_stale');
});

test('runtime is fail-closed, activation is CAS guarded and daily budget rolls back when exceeded', async () => {
  const empty = createCommandDb({ users: [DIRECTOR] });
  await assert.rejects(() => assertLeozOpsExecutionAvailable(empty.db,
    capabilityById('lead.followup.create'),
    { env: ENV, now: NOW }), error => error.code === 'leozops_runtime_kill_switch');
  await assert.rejects(() => updateLeozOpsRuntime(empty.db, DIRECTOR, {
    contract: LEOZOPS_RUNTIME_CONTRACT, version: 1, action: 'activate', expected_version: 0, daily_action_limit: 1,
  }, { env: { ...ENV, LEOZOPS_EXECUTION_ENABLED: 'false' }, now: NOW }), error => error.code === 'leozops_runtime_deployment_disabled');
  const activated = await updateLeozOpsRuntime(empty.db, DIRECTOR, {
    contract: LEOZOPS_RUNTIME_CONTRACT, version: 1, action: 'activate', expected_version: 0, daily_action_limit: 1,
  }, { env: ENV, now: NOW });
  assert.equal(activated.runtime.execution_enabled, true);
  const intent1 = { id: 'budget_1', capability: 'lead.followup.create', budgetConsumedAt: null };
  const intent2 = { id: 'budget_2', capability: 'lead.source.update', budgetConsumedAt: null };
  empty.state.intents.push(intent1, intent2);
  await consumeLeozOpsActionBudget(empty.db, intent1, empty.state.runtimes[0], NOW);
  await assert.rejects(() => consumeLeozOpsActionBudget(empty.db, intent2, empty.state.runtimes[0], NOW), error => error.code === 'leozops_runtime_budget_exceeded');
  assert.equal(empty.state.intents.find(row => row.id === 'budget_2').budgetConsumedAt, null);
  assert.equal(empty.state.quotas[0].requestCount, 1);
});
