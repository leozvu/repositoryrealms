import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evidenceExplanation,
  normalizeWorkEvidenceDraft,
  WorkEvidenceContractError,
  WORK_EVIDENCE_POLICY_V1,
} from '../lib/work-evidence-contract.js';
import {
  listOwnWorkEvidenceEvents,
  recordWorkEvidenceEvent,
  requestWorkEvidenceReview,
} from '../lib/work-evidence-admin.js';

const NOW = new Date('2026-07-20T12:00:00.000Z');
const USER = { id: 'user-123', name: 'Staff One', roles: '["STAFF"]' };
const MANAGER = { id: 'manager-123', name: 'Lead One', roles: '["LEAD"]' };

function taskObserved(overrides = {}) {
  return {
    idempotencyKey: 'evidence:task:123:started:v1',
    subjectType: 'task',
    subjectId: 'task-123',
    eventType: 'task.started',
    sourceClass: 'observed',
    purpose: 'operational_visibility',
    actorId: USER.id,
    occurredAt: '2026-07-20T11:59:00.000Z',
    provenance: 'repository_receipt',
    metadata: { businessReceiptId: 'receipt-123', surface: 'realm', taskStatus: 'doing' },
    ...overrides,
  };
}

test('Phase 0 policy starts fail-closed in shadow mode with collection disabled', () => {
  assert.equal(WORK_EVIDENCE_POLICY_V1.mode, 'shadow');
  assert.equal(WORK_EVIDENCE_POLICY_V1.collectionActive, false);
  assert.ok(WORK_EVIDENCE_POLICY_V1.prohibitedDecisionUses.includes('gold_award'));
  assert.ok(WORK_EVIDENCE_POLICY_V1.prohibitedSignals.includes('keylogger'));
});

test('Phase 0 normalizes allowlisted observed evidence and sets retention', () => {
  const draft = normalizeWorkEvidenceDraft(taskObserved(), { now: NOW });
  assert.equal(draft.sourceClass, 'observed');
  assert.equal(draft.confidence, 'medium');
  assert.equal(draft.policyVersion, '1.0.0');
  assert.equal(draft.retentionUntil.toISOString(), '2027-07-20T12:00:00.000Z');
  assert.deepEqual(JSON.parse(draft.metadata), {
    businessReceiptId: 'receipt-123', surface: 'realm', taskStatus: 'doing',
  });
});

test('Phase 0 rejects surveillance signal and metadata outside allowlist', () => {
  assert.throws(
    () => normalizeWorkEvidenceDraft(taskObserved({ metadata: { gps: '10,20' } }), { now: NOW }),
    (error) => error instanceof WorkEvidenceContractError && error.code === 'work_evidence_surveillance_signal_prohibited',
  );
  assert.throws(
    () => normalizeWorkEvidenceDraft(taskObserved({ metadata: { employeeScore: 99 } }), { now: NOW }),
    (error) => error instanceof WorkEvidenceContractError && error.code === 'work_evidence_metadata_not_allowed',
  );
});

test('Phase 0 requires RepositoryRealms receipt for observed task evidence', () => {
  assert.throws(
    () => normalizeWorkEvidenceDraft(taskObserved({ metadata: { surface: 'erp', taskStatus: 'doing' } }), { now: NOW }),
    (error) => error instanceof WorkEvidenceContractError && error.code === 'work_evidence_metadata_required',
  );
  assert.throws(
    () => normalizeWorkEvidenceDraft(taskObserved({ metadata: { businessReceiptId: '127.0.0.1', surface: 'erp', taskStatus: 'doing' } }), { now: NOW }),
    (error) => error instanceof WorkEvidenceContractError && error.code === 'work_evidence_receipt_invalid',
  );
});

test('Phase 0 shadow mode blocks Gold, payroll and individual ranking purposes', () => {
  for (const purpose of ['gold_award', 'payroll', 'individual_performance_ranking']) {
    assert.throws(
      () => normalizeWorkEvidenceDraft(taskObserved({ purpose }), { now: NOW }),
      (error) => error instanceof WorkEvidenceContractError && error.code === 'work_evidence_shadow_decision_prohibited',
    );
  }
});

test('Phase 0 keeps self-declared evidence unverified', () => {
  const draft = normalizeWorkEvidenceDraft({
    idempotencyKey: 'evidence:timelog:123:submitted:v1',
    subjectType: 'timelog', subjectId: 'timelog-123', eventType: 'timelog.submitted',
    sourceClass: 'declared', purpose: 'data_quality', actorId: USER.id,
    occurredAt: '2026-07-20T11:00:00.000Z', provenance: 'user_input',
    metadata: { hours: 2, billable: true, surface: 'erp' },
  }, { now: NOW });
  assert.equal(draft.confidence, 'unverified');
  assert.throws(
    () => normalizeWorkEvidenceDraft({ ...taskObserved(), sourceClass: 'declared', confidence: 'high' }, { now: NOW }),
    /Nguồn evidence không phù hợp/,
  );
});

test('Phase 0 refuses observed evidence from an untrusted producer', async () => {
  const db = { workEvidenceEvent: { findUnique: async () => null } };
  await assert.rejects(
    () => recordWorkEvidenceEvent(db, USER, taskObserved(), { now: NOW }),
    (error) => error.code === 'work_evidence_trusted_producer_required' && error.status === 403,
  );
});

test('Phase 0 records event and payload-free audit atomically, then replays idempotently', async () => {
  let stored = null;
  const audits = [];
  const db = {
    workEvidenceEvent: { findUnique: async () => stored },
    realmActionReceipt: { findUnique: async () => ({ id: 'receipt-123', entityId: 'task-123' }) },
    $transaction: async (callback) => callback({
      workEvidenceEvent: {
        create: async ({ data }) => {
          stored = { id: 'event-1', recordedAt: NOW, ...data };
          return stored;
        },
      },
      auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    }),
  };
  const created = await recordWorkEvidenceEvent(db, USER, taskObserved(), { now: NOW, trustedProducer: true });
  const replayed = await recordWorkEvidenceEvent(db, USER, taskObserved(), { now: NOW, trustedProducer: true });
  assert.equal(created.idempotent, false);
  assert.equal(replayed.idempotent, true);
  assert.equal(replayed.receipt.id, 'event-1');
  assert.equal(audits.length, 1);
  assert.doesNotMatch(audits[0].detail, /receipt-123/);
  assert.doesNotMatch(audits[0].detail, /doing/);
});

test('Phase 0 allows manager validation but rejects staff validation', async () => {
  const validated = {
    idempotencyKey: 'evidence:task:123:validated:v1',
    subjectType: 'task', subjectId: 'task-123', eventType: 'manager.validation',
    sourceClass: 'validated', purpose: 'data_quality',
    occurredAt: '2026-07-20T11:59:00.000Z', provenance: 'manager_review',
    metadata: {
      businessReceiptId: 'receipt-validation-123',
      decision: 'confirmed',
      reasonCode: 'evidence_complete',
      validatorRole: 'LEAD',
    },
  };
  const db = { workEvidenceEvent: { findUnique: async () => null } };
  await assert.rejects(
    () => recordWorkEvidenceEvent(db, USER, validated, { now: NOW }),
    (error) => error.code === 'work_evidence_validation_forbidden',
  );
  const events = [];
  const managerDb = {
    workEvidenceEvent: { findUnique: async () => null },
    realmActionReceipt: { findUnique: async () => ({ id: 'receipt-validation-123', entityId: 'task-123' }) },
    $transaction: async (callback) => callback({
      workEvidenceEvent: { create: async ({ data }) => { const row = { id: 'event-2', ...data }; events.push(row); return row; } },
      auditLog: { create: async () => ({}) },
    }),
  };
  const result = await recordWorkEvidenceEvent(managerDb, MANAGER, validated, { now: NOW });
  assert.equal(result.event.actorId, MANAGER.id);
  assert.equal(events.length, 1);
});

test('Phase 0 verifies business receipt ownership before accepting evidence', async () => {
  const db = {
    workEvidenceEvent: { findUnique: async () => null },
    realmActionReceipt: { findUnique: async () => ({ id: 'receipt-123', entityId: 'task-other' }) },
  };
  await assert.rejects(
    () => recordWorkEvidenceEvent(db, USER, taskObserved(), { now: NOW, trustedProducer: true }),
    (error) => error.code === 'work_evidence_business_receipt_mismatch' && error.status === 409,
  );
  db.realmActionReceipt.findUnique = async () => null;
  await assert.rejects(
    () => recordWorkEvidenceEvent(db, USER, taskObserved(), { now: NOW, trustedProducer: true }),
    (error) => error.code === 'work_evidence_business_receipt_not_found' && error.status === 409,
  );
});

test('Phase 0 self read path is server-scoped to the authenticated actor', async () => {
  let query = null;
  const db = { workEvidenceEvent: { findMany: async (input) => { query = input; return [{ id: 'event-1' }]; } } };
  const rows = await listOwnWorkEvidenceEvents(db, USER, { before: '2026-07-20T12:00:00.000Z', take: 25 });
  assert.deepEqual(rows, [{ id: 'event-1' }]);
  assert.deepEqual(query.where, { actorId: USER.id, occurredAt: { lt: NOW } });
  assert.equal(query.take, 25);
  await assert.rejects(
    () => listOwnWorkEvidenceEvents(db, USER, { take: 101 }),
    (error) => error.code === 'work_evidence_page_size_invalid',
  );
});

test('Phase 0 review is available to the evidence actor and not another staff user', async () => {
  const evidence = { id: 'event-1', actorId: USER.id };
  const db = {
    workEvidenceEvent: { findUnique: async () => evidence },
    evidenceReviewRequest: { findFirst: async () => null },
    $transaction: async (callback) => callback({
      evidenceReviewRequest: { create: async ({ data }) => ({ id: 'review-1', status: 'pending', ...data }) },
      auditLog: { create: async () => ({}) },
    }),
  };
  const result = await requestWorkEvidenceReview(db, USER, {
    evidenceEventId: 'event-1', reasonCode: 'wrong_timestamp', note: 'Please review.',
  });
  assert.equal(result.review.id, 'review-1');
  await assert.rejects(
    () => requestWorkEvidenceReview(db, { ...USER, id: 'user-999' }, { evidenceEventId: 'event-1', reasonCode: 'wrong_timestamp' }),
    (error) => error.code === 'work_evidence_review_forbidden',
  );
});

test('Phase 0 evidence explanation never presents presence as productivity', () => {
  assert.deepEqual(evidenceExplanation({
    sourceClass: 'declared', confidence: 'unverified', purpose: 'operational_visibility', policyVersion: '1.0.0',
  }), {
    source: 'declared', confidence: 'unverified', purpose: 'operational_visibility', policyVersion: '1.0.0',
    isPerformanceScore: false, presenceEqualsProductivity: false,
  });
});
