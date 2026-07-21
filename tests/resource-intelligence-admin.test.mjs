import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enrichTasksWithResourceIntelligence,
  executeResourceEstimateAction,
  normalizeResourceEstimateCommand,
} from '../lib/resource-intelligence-admin.js';

const STAFF = { id: 'staff-1', name: 'Staff', roles: ['STAFF'], userType: 'employee' };
const PM = { id: 'pm-1', name: 'PM', roles: ['PM'], userType: 'employee' };
const TASK = {
  id: 'task-1', title: 'Landing page', status: 'doing', assigneeId: STAFF.id, assignee: { id: STAFF.id, teamId: 'creative' },
  estHours: 4, workType: 'design', complexity: 'medium', workVersion: 3,
};
const key = (suffix) => `resource-intelligence:${suffix}:123456789`;

function actionDb({ task = TASK, receipt = null, updateCount = 1 } = {}) {
  const calls = { update: null, receipt: null, revision: null, event: null, audit: null, reads: 0 };
  const tx = {
    task: { updateMany: async (args) => { calls.update = args; return { count: updateCount }; } },
    realmActionReceipt: { create: async ({ data }) => { calls.receipt = data; return { id: 'receipt-1', ...data }; } },
    workEstimateRevision: { create: async ({ data }) => { calls.revision = data; return { id: 'revision-1', ...data }; } },
    workItemEvent: { create: async ({ data }) => { calls.event = data; return { id: 'event-1', ...data }; } },
    auditLog: { create: async ({ data }) => { calls.audit = data; return data; } },
  };
  return {
    calls,
    db: {
      realmActionReceipt: { findUnique: async () => receipt },
      task: { findUnique: async () => { calls.reads += 1; return task; } },
      $transaction: async (fn) => fn(tx),
    },
  };
}

test('Estimate command chuẩn hóa taxonomy và bắt manager nêu lý do', () => {
  const command = normalizeResourceEstimateCommand({
    action: 'task.estimate', entityId: TASK.id, expectedVersion: 3, estimateKind: 'declared',
    estimateHours: 6.25, workType: 'DESIGN', complexity: 'medium', idempotencyKey: key('normalize'),
  });
  assert.equal(command.estimateHours, 6.25);
  assert.equal(command.workType, 'design');
  assert.throws(() => normalizeResourceEstimateCommand({
    action: 'task.estimate', entityId: TASK.id, expectedVersion: 3, estimateKind: 'manager_adjustment',
    estimateHours: 6, workType: 'design', complexity: 'medium', idempotencyKey: key('reason'),
  }), (error) => error.code === 'resource_intelligence_manager_reason_required');
});

test('Assignee khai báo estimate với CAS, receipt, revision, WorkItemEvent và audit atomically', async () => {
  const { db, calls } = actionDb();
  const result = await executeResourceEstimateAction(db, STAFF, {
    action: 'task.estimate', entityId: TASK.id, expectedVersion: 3, estimateKind: 'declared', estimateHours: 5,
    workType: 'design', complexity: 'medium', note: 'Có thêm responsive state', idempotencyKey: key('declared'),
  }, new Date('2026-07-20T12:00:00.000Z'));
  assert.equal(result.idempotent, false);
  assert.equal(calls.update.where.workVersion, 3);
  assert.equal(calls.update.data.workVersion.increment, 1);
  assert.equal(calls.receipt.action, 'task.estimate');
  assert.equal(calls.revision.kind, 'declared');
  assert.equal(calls.revision.previousHours, 4);
  assert.equal(calls.event.receiptId, 'receipt-1');
  assert.equal(calls.audit.action, 'resource_estimate_updated');
});

test('Manager adjustment cần manager scope; self declaration không được sửa Task người khác', async () => {
  await assert.rejects(executeResourceEstimateAction(actionDb().db, { ...STAFF, id: 'other' }, {
    action: 'task.estimate', entityId: TASK.id, expectedVersion: 3, estimateKind: 'declared', estimateHours: 5,
    workType: 'design', complexity: 'medium', idempotencyKey: key('wrong-owner'),
  }), (error) => error.code === 'resource_intelligence_declaration_forbidden');

  const manager = actionDb();
  await executeResourceEstimateAction(manager.db, PM, {
    action: 'task.estimate', entityId: TASK.id, expectedVersion: 3, estimateKind: 'manager_adjustment', estimateHours: 6,
    workType: 'design', complexity: 'large', reasonCode: 'scope_change', note: 'Bổ sung landing states', idempotencyKey: key('manager'),
  });
  assert.equal(manager.calls.revision.kind, 'manager_adjustment');
  assert.equal(manager.calls.revision.reasonCode, 'scope_change');
});

test('Idempotent replay không đọc hoặc ghi lại Task', async () => {
  const receipt = {
    id: 'receipt-old', userId: STAFF.id, action: 'task.estimate', resource: 'tasks', entityId: TASK.id,
    fromState: 'version:3', toState: 'estimate:5:design:medium', payloadHash: null,
  };
  const replay = actionDb({ receipt });
  const result = await executeResourceEstimateAction(replay.db, STAFF, {
    action: 'task.estimate', entityId: TASK.id, expectedVersion: 3, estimateKind: 'declared', estimateHours: 5,
    workType: 'design', complexity: 'medium', idempotencyKey: key('replay'),
  });
  assert.equal(result.idempotent, true);
  assert.equal(replay.calls.reads, 0);
});

test('Read enrichment dùng TimeLog ERP và completed Task cùng taxonomy', async () => {
  const db = {
    task: { findMany: async () => [
      { id: 'h1', status: 'done', estHours: 3, workType: 'design', complexity: 'medium' },
      { id: 'h2', status: 'done', estHours: 4, workType: 'design', complexity: 'medium' },
      { id: 'h3', status: 'done', estHours: 5, workType: 'design', complexity: 'medium' },
    ] },
    workEstimateRevision: { findMany: async () => [{ taskId: TASK.id, kind: 'manager_adjustment', createdAt: new Date('2026-07-20T10:00:00.000Z') }] },
    timeLog: { groupBy: async () => [
      { taskId: TASK.id, _sum: { hours: 2 } },
      { taskId: 'h1', _sum: { hours: 3 } }, { taskId: 'h2', _sum: { hours: 4 } }, { taskId: 'h3', _sum: { hours: 5 } },
    ] },
  };
  const result = await enrichTasksWithResourceIntelligence(db, [TASK]);
  assert.equal(result.tasks[0].intelligence.actual.hours, 2);
  assert.equal(result.tasks[0].intelligence.historical.medianHours, 4);
  assert.equal(result.tasks[0].intelligence.estimate.source, 'manager_validated');
  assert.equal(result.summary.employeeRanking, false);
});
