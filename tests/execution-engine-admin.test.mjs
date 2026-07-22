import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeExecutionAction,
  loadMyWork,
  loadTeamWork,
  normalizeExecutionCommand,
} from '../lib/execution-engine-admin.js';

const PM = { id: 'pm-1', name: 'PM', roles: ['PM'], userType: 'employee' };
const LEAD = { id: 'lead-1', name: 'Lead', roles: ['LEAD'], teamId: 'delivery', userType: 'employee' };
const BASE = {
  id: 'task-1', title: 'Canonical task', projectId: 'project-1', assigneeId: 'staff-1', priority: 'medium',
  status: 'doing', dueDate: '2026-07-25', estHours: 4, queuePosition: 1, workVersion: 3,
  escalationLevel: 0, mergedIntoTaskId: null, assignee: { id: 'staff-1', teamId: 'delivery' },
};
const key = (suffix) => `execution-engine:${suffix}:123456789`;

function singleDb({ before = BASE, updated = null, receipt = null, updateCount = 1 } = {}) {
  const calls = { update: null, receipt: null, event: null, audit: null, reads: 0 };
  const after = updated || { ...before, workVersion: before.workVersion + 1 };
  const tx = {
    task: {
      updateMany: async (args) => { calls.update = args; return { count: updateCount }; },
      findUnique: async () => after,
    },
    realmActionReceipt: { create: async ({ data }) => { calls.receipt = data; return { id: 'receipt-1', ...data }; } },
    workItemEvent: { create: async ({ data }) => { calls.event = data; return { id: 'event-1', ...data }; } },
    auditLog: { create: async ({ data }) => { calls.audit = data; return data; } },
  };
  return {
    calls,
    db: {
      realmActionReceipt: { findUnique: async () => receipt },
      task: { findUnique: async () => { calls.reads += 1; return before; } },
      $transaction: async (fn) => fn(tx),
    },
  };
}

test('Execution command contract chuẩn hóa sáu manager action và từ chối payload mơ hồ', () => {
  const common = { entityId: 'task-1', idempotencyKey: key('normalize') };
  assert.equal(normalizeExecutionCommand({ ...common, action: 'task.reprioritize', ownerId: 'staff-1', expectedQueueVersion: 0, targetIndex: 2 }).nextState, 'queue:1');
  assert.equal(normalizeExecutionCommand({ ...common, action: 'task.block', expectedVersion: 3, reasonCode: 'dependency', reason: 'Chờ API' }).nextState, 'blocked');
  assert.equal(normalizeExecutionCommand({ ...common, action: 'task.unblock', expectedVersion: 3, nextStatus: 'doing' }).nextState, 'doing');
  assert.equal(normalizeExecutionCommand({ ...common, action: 'task.escalate', expectedVersion: 3, level: 2, reasonCode: 'decision', reason: 'Cần quyết định' }).level, 2);
  assert.equal(normalizeExecutionCommand({ ...common, action: 'task.split', expectedVersion: 3, children: [{ title: 'A' }, { title: 'B' }] }).children.length, 2);
  assert.equal(normalizeExecutionCommand({ ...common, action: 'task.merge', expectedVersion: 3, sourceTaskIds: ['task-1', 'task-2'], expectedVersions: { 'task-1': 3, 'task-2': 4 }, title: 'AB' }).sourceTaskIds.length, 2);
  assert.throws(() => normalizeExecutionCommand({ ...common, action: 'task.block', expectedVersion: 3, reasonCode: 'dependency', reason: '' }), (error) => error.code === 'execution_block_reason_required');
  assert.throws(() => normalizeExecutionCommand({ ...common, action: 'task.split', expectedVersion: 3, children: [{ title: 'A' }] }), (error) => error.code === 'execution_split_children_invalid');
});

test('Block dùng work-version CAS và ghi receipt, WorkItemEvent, AuditLog atomically', async () => {
  const { db, calls } = singleDb({ updated: { ...BASE, status: 'blocked', blockReason: 'Chờ API', workVersion: 4 } });
  const result = await executeExecutionAction(db, LEAD, {
    action: 'task.block', entityId: BASE.id, expectedVersion: 3, reasonCode: 'dependency', reason: 'Chờ API', idempotencyKey: key('block'),
  }, new Date('2026-07-20T12:00:00.000Z'));
  assert.equal(result.idempotent, false);
  assert.deepEqual(calls.update.where, { id: BASE.id, workVersion: 3 });
  assert.equal(calls.update.data.status, 'blocked');
  assert.equal(calls.receipt.action, 'task.block');
  assert.equal(calls.event.receiptId, 'receipt-1');
  assert.equal(calls.event.fromState, 'doing');
  assert.equal(calls.audit.action, 'execution_action');
});

test('Unblock và escalation bảo vệ state/version, manager scope và monotonic level', async () => {
  const blocked = { ...BASE, status: 'blocked', blockReason: 'X', escalationLevel: 1 };
  const unblock = singleDb({ before: blocked, updated: { ...blocked, status: 'todo', workVersion: 4 } });
  await executeExecutionAction(unblock.db, LEAD, { action: 'task.unblock', entityId: BASE.id, expectedVersion: 3, nextStatus: 'todo', idempotencyKey: key('unblock') });
  assert.equal(unblock.calls.update.data.blockReason, null);

  const escalation = singleDb({ before: blocked, updated: { ...blocked, escalationLevel: 2, workVersion: 4 } });
  await executeExecutionAction(escalation.db, LEAD, { action: 'task.escalate', entityId: BASE.id, expectedVersion: 3, level: 2, reasonCode: 'decision', reason: 'Cần giám đốc', idempotencyKey: key('escalate') });
  assert.equal(escalation.calls.update.data.escalationLevel, 2);
  assert.match(escalation.calls.event.metadata, /Cần giám đốc/);

  await assert.rejects(executeExecutionAction(singleDb().db, { id: 'staff', roles: ['STAFF'] }, { action: 'task.block' }), (error) => error.code === 'execution_manager_forbidden');
  const outside = singleDb({ before: { ...BASE, assignee: { id: 'staff-2', teamId: 'other' } } });
  await assert.rejects(executeExecutionAction(outside.db, LEAD, { action: 'task.block', entityId: BASE.id, expectedVersion: 3, reasonCode: 'dependency', reason: 'X', idempotencyKey: key('outside') }), (error) => error.code === 'execution_task_not_found');
});

test('Idempotent replay trả receipt cũ mà không đọc hoặc ghi Task', async () => {
  const receipt = {
    id: 'receipt-old', userId: PM.id, action: 'task.block', resource: 'tasks', entityId: BASE.id,
    fromState: 'version:3', toState: 'blocked', payloadHash: null,
  };
  const replay = singleDb({ receipt });
  const result = await executeExecutionAction(replay.db, PM, { action: 'task.block', entityId: BASE.id, expectedVersion: 3, reasonCode: 'dependency', reason: 'X', idempotencyKey: key('replay') });
  assert.equal(result.idempotent, true);
  assert.equal(replay.calls.reads, 0);
});

test('Reprioritize CAS queue version và viết vị trí liên tục', async () => {
  const calls = { queue: null, positions: [], event: null };
  const tx = {
    workQueueState: { create: async ({ data }) => { calls.queue = data; return data; } },
    task: {
      findMany: async () => [{ id: 'task-1' }, { id: 'task-2' }],
      update: async ({ where, data }) => { calls.positions.push({ id: where.id, position: data.queuePosition }); return { id: where.id }; },
      findUnique: async () => ({ ...BASE, queuePosition: 2, workVersion: 4 }),
    },
    realmActionReceipt: { create: async ({ data }) => ({ id: 'receipt-q', ...data }) },
    workItemEvent: { create: async ({ data }) => { calls.event = data; return data; } },
    auditLog: { create: async ({ data }) => data },
  };
  const db = {
    realmActionReceipt: { findUnique: async () => null },
    user: { findUnique: async () => ({ id: 'staff-1', teamId: 'delivery', status: 'active', userType: 'employee' }) },
    task: { findUnique: async () => BASE },
    workQueueState: { findUnique: async () => null },
    $transaction: async (fn) => fn(tx),
  };
  const result = await executeExecutionAction(db, LEAD, { action: 'task.reprioritize', entityId: BASE.id, ownerId: 'staff-1', expectedQueueVersion: 0, targetIndex: 1, idempotencyKey: key('queue') });
  assert.equal(calls.queue.version, 1);
  assert.deepEqual(calls.positions, [{ id: 'task-2', position: 1 }, { id: 'task-1', position: 2 }]);
  assert.match(calls.event.metadata, /"queueVersion":1/);
  assert.equal(result.updated.queuePosition, 2);
});

test('Nhân viên tự sắp hàng đợi CỦA MÌNH được; hàng đợi người khác vẫn cần manager', async () => {
  const STAFF = { id: 'staff-1', name: 'Staff', roles: ['STAFF'], teamId: 'delivery', userType: 'employee' };
  const makeDb = (ownerId) => {
    const tx = {
      workQueueState: { create: async ({ data }) => data },
      task: {
        findMany: async () => [{ id: 'task-1' }, { id: 'task-2' }],
        update: async ({ where }) => ({ id: where.id }),
        findUnique: async () => ({ ...BASE, queuePosition: 2, workVersion: 4 }),
      },
      realmActionReceipt: { create: async ({ data }) => ({ id: 'receipt-self', ...data }) },
      workItemEvent: { create: async ({ data }) => data },
      auditLog: { create: async ({ data }) => data },
    };
    return {
      realmActionReceipt: { findUnique: async () => null },
      user: { findUnique: async () => ({ id: ownerId, teamId: 'delivery', status: 'active', userType: 'employee' }) },
      task: { findUnique: async () => BASE },
      workQueueState: { findUnique: async () => null },
      $transaction: async (fn) => fn(tx),
    };
  };
  // Chính mình: được sắp lại (task-1 thuộc staff-1 trong BASE)
  const self = await executeExecutionAction(makeDb('staff-1'), STAFF, {
    action: 'task.reprioritize', entityId: BASE.id, ownerId: 'staff-1', expectedQueueVersion: 0, targetIndex: 1, idempotencyKey: key('self-queue'),
  });
  assert.equal(self.updated.queuePosition, 2);
  // Hàng đợi người khác: STAFF bị chặn như cũ
  await assert.rejects(
    executeExecutionAction(makeDb('staff-2'), STAFF, {
      action: 'task.reprioritize', entityId: BASE.id, ownerId: 'staff-2', expectedQueueVersion: 0, targetIndex: 1, idempotencyKey: key('other-queue'),
    }),
    (error) => error.code === 'execution_manager_forbidden',
  );
  // Freelancer không dùng hàng đợi nội bộ, kể cả của chính mình
  await assert.rejects(
    executeExecutionAction(makeDb('fl-1'), { id: 'fl-1', roles: ['FREELANCER'], userType: 'freelancer' }, {
      action: 'task.reprioritize', entityId: BASE.id, ownerId: 'fl-1', expectedQueueVersion: 0, targetIndex: 0, idempotencyKey: key('freelancer-queue'),
    }),
    (error) => error.code === 'execution_freelancer_forbidden',
  );
});

test('Split tạo lineage; merge chỉ hợp nhất Task cùng project và owner', async () => {
  let child = 0;
  const splitTx = {
    task: {
      updateMany: async () => ({ count: 1 }),
      create: async ({ data }) => ({ id: `child-${++child}`, ...data }),
      findUnique: async () => ({ ...BASE, status: 'waiting', workVersion: 4 }),
    },
    realmActionReceipt: { create: async ({ data }) => ({ id: 'receipt-split', ...data }) },
    workItemEvent: { create: async ({ data }) => data }, auditLog: { create: async ({ data }) => data },
  };
  const splitDb = { realmActionReceipt: { findUnique: async () => null }, task: { findUnique: async () => BASE }, $transaction: async (fn) => fn(splitTx) };
  const split = await executeExecutionAction(splitDb, PM, { action: 'task.split', entityId: BASE.id, expectedVersion: 3, children: [{ title: 'A' }, { title: 'B' }], idempotencyKey: key('split') });
  assert.deepEqual(split.related.map((item) => item.parentTaskId), [BASE.id, BASE.id]);
  assert.equal(split.emissions.length, 3);

  const source2 = { ...BASE, id: 'task-2', title: 'Second', workVersion: 4 };
  const mergeTx = {
    task: {
      create: async ({ data }) => ({ id: 'task-merged', ...data }),
      updateMany: async () => ({ count: 1 }),
    },
    realmActionReceipt: { create: async ({ data }) => ({ id: 'receipt-merge', ...data }) },
    workItemEvent: { create: async ({ data }) => data }, auditLog: { create: async ({ data }) => data },
  };
  const mergeDb = { realmActionReceipt: { findUnique: async () => null }, task: { findMany: async () => [BASE, source2] }, $transaction: async (fn) => fn(mergeTx) };
  const merged = await executeExecutionAction(mergeDb, PM, { action: 'task.merge', entityId: BASE.id, expectedVersion: 3, sourceTaskIds: [BASE.id, source2.id], expectedVersions: { [BASE.id]: 3, [source2.id]: 4 }, title: 'Merged', idempotencyKey: key('merge') });
  assert.equal(merged.updated.id, 'task-merged');
  assert.equal(merged.emissions.length, 3);
});

test('Read models giới hạn dữ liệu theo self và manager scope', async () => {
  const myDb = {
    task: { findMany: async ({ where }) => where.status.in.includes('doing') ? [{ ...BASE, assigneeId: where.assigneeId }] : [] },
    workQueueState: { findUnique: async () => null },
    workEstimateRevision: { findMany: async () => [] },
    timeLog: { groupBy: async () => [] },
  };
  const mine = await loadMyWork(myDb, { id: 'staff-1', roles: ['STAFF'], userType: 'employee' }, new Date('2026-07-20T12:00:00.000Z'));
  assert.equal(mine.source, 'erp-task');
  assert.equal(mine.queue.version, 0);
  assert.equal(mine.metrics.open, 1);

  const teamDb = {
    user: { findMany: async () => [{ id: 'staff-1', name: 'An', teamId: 'delivery' }] },
    task: { findMany: async () => [BASE] },
    workQueueState: { findMany: async () => [{ ownerId: 'staff-1', version: 2, wipLimit: 3 }] },
    workEstimateRevision: { findMany: async () => [] },
    timeLog: { groupBy: async () => [] },
  };
  const team = await loadTeamWork(teamDb, LEAD, new Date('2026-07-20T12:00:00.000Z'));
  assert.equal(team.scope, 'team');
  assert.equal(team.members[0].queue.version, 2);
  assert.equal(team.policy.employeeRanking, false);
});
