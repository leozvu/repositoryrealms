import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRealmRecordAction } from '../lib/realm-action-admin.js';

const KEY = 'realm-action:123456789abc';

function taskDb(overrides = {}) {
  const calls = { update: null, receipt: null, audit: null, taskReads: 0 };
  const before = overrides.before || {
    id: 'task-1', title: 'Build bridge', assigneeId: 'staff-1', status: 'todo',
    dueDate: '2026-07-22', priority: 'medium', dependsOn: '[]', assignee: { id: 'staff-1', teamId: 'delivery' },
  };
  const updated = { ...before, status: overrides.nextState || 'in_progress' };
  const tx = {
    task: {
      updateMany: async (args) => { calls.update = args; return { count: overrides.updateCount ?? 1 }; },
      findUnique: async () => updated,
    },
    realmActionReceipt: { create: async ({ data }) => { calls.receipt = data; return { id: 'receipt-1', ...data }; } },
    auditLog: { create: async ({ data }) => { calls.audit = data; return data; } },
  };
  const db = {
    realmActionReceipt: { findUnique: async () => overrides.receipt || null },
    task: {
      findUnique: async () => { calls.taskReads += 1; return before; },
      findMany: async () => [],
    },
    user: { findUnique: async () => overrides.target || { id: 'staff-2', teamId: 'delivery', status: 'active', userType: 'employee' } },
    $transaction: async (fn) => fn(tx),
  };
  return { db, calls };
}

function leadDb(overrides = {}) {
  const calls = { update: null, receipt: null, audit: null, leadReads: 0 };
  const before = overrides.before || { id: 'lead-1', name: 'Lan', ownerId: 'am-1', stage: 'new' };
  const updated = { ...before, stage: overrides.nextState || 'contacted' };
  const tx = {
    lead: {
      updateMany: async (args) => { calls.update = args; return { count: overrides.updateCount ?? 1 }; },
      findUnique: async () => updated,
    },
    realmActionReceipt: { create: async ({ data }) => { calls.receipt = data; return { id: 'receipt-lead', ...data }; } },
    auditLog: { create: async ({ data }) => { calls.audit = data; return data; } },
  };
  const db = {
    realmActionReceipt: { findUnique: async () => overrides.receipt || null },
    lead: { findUnique: async () => { calls.leadReads += 1; return before; } },
    $transaction: async (fn) => fn(tx),
  };
  return { db, calls };
}

test('Task assignee chuyển Quest bằng compare-and-swap, receipt và audit trong một transaction', async () => {
  const { db, calls } = taskDb();
  const result = await executeRealmRecordAction(db, { id: 'staff-1', name: 'Mai Anh', roles: ['STAFF'], teamId: 'delivery' }, {
    action: 'task.transition', entityId: 'task-1', expectedState: 'todo', nextState: 'in_progress', idempotencyKey: KEY,
  }, new Date('2026-07-18T21:00:00.000Z'));
  assert.equal(result.idempotent, false);
  assert.deepEqual(calls.update.where, { id: 'task-1', status: 'todo' });
  assert.deepEqual(calls.update.data, { status: 'in_progress', statusSince: '2026-07-18' });
  assert.equal(calls.receipt.idempotencyKey, KEY);
  assert.equal(calls.audit.action, 'realm_action');
  assert.equal(calls.audit.entity, 'tasks');
});

test('Task command từ snapshot cũ bị từ chối trước transaction', async () => {
  const { db, calls } = taskDb({ before: {
    id: 'task-1', title: 'Build bridge', assigneeId: 'staff-1', status: 'review', dependsOn: '[]',
    assignee: { id: 'staff-1', teamId: 'delivery' },
  } });
  await assert.rejects(executeRealmRecordAction(db, { id: 'staff-1', roles: ['STAFF'], teamId: 'delivery' }, {
    action: 'task.transition', entityId: 'task-1', expectedState: 'todo', nextState: 'in_progress', idempotencyKey: KEY,
  }), (error) => error.status === 409 && error.code === 'realm_action_stale');
  assert.equal(calls.update, null);
});

test('PM phân công Task bằng compare-and-swap và giữ Task ERP làm nguồn duy nhất', async () => {
  const { db, calls } = taskDb();
  const result = await executeRealmRecordAction(db, { id: 'pm-1', name: 'PM', roles: ['PM'] }, {
    action: 'task.assign',
    entityId: 'task-1',
    expectedAssigneeId: 'staff-1',
    assigneeId: 'staff-2',
    expectedDueDate: '2026-07-22',
    dueDate: '2026-07-24',
    expectedPriority: 'medium',
    priority: 'high',
    idempotencyKey: `${KEY}:assign`,
  });
  assert.equal(result.resource, 'tasks');
  assert.deepEqual(calls.update.where, {
    id: 'task-1', assigneeId: 'staff-1', dueDate: '2026-07-22', priority: 'medium',
  });
  assert.deepEqual(calls.update.data, { assigneeId: 'staff-2', dueDate: '2026-07-24', priority: 'high' });
  assert.equal(calls.receipt.action, 'task.assign');
  assert.equal(calls.audit.entity, 'tasks');
});

test('Trưởng Guild không thể phân công ra ngoài team', async () => {
  const scoped = taskDb({ target: { id: 'staff-2', teamId: 'other', status: 'active', userType: 'employee' } });
  await assert.rejects(executeRealmRecordAction(scoped.db, { id: 'lead-1', name: 'Lead', roles: ['LEAD'], teamId: 'delivery' }, {
    action: 'task.assign', entityId: 'task-1', expectedAssigneeId: 'staff-1', assigneeId: 'staff-2',
    expectedDueDate: '2026-07-22', dueDate: '2026-07-24', expectedPriority: 'medium', priority: 'high',
    idempotencyKey: `${KEY}:outside-team`,
  }), (error) => error.code === 'realm_assignment_target_outside_scope');
  assert.equal(scoped.calls.update, null);
});

test('Realm không cho mở lại Quest done hoặc sửa Task ngoài scope', async () => {
  const finished = taskDb({ before: {
    id: 'task-1', assigneeId: 'staff-1', status: 'done', dependsOn: '[]', assignee: { id: 'staff-1', teamId: 'delivery' },
  } });
  await assert.rejects(executeRealmRecordAction(finished.db, { id: 'staff-1', roles: ['STAFF'], teamId: 'delivery' }, {
    action: 'task.transition', entityId: 'task-1', expectedState: 'done', nextState: 'todo', idempotencyKey: KEY,
  }), (error) => error.code === 'realm_task_transition_invalid');

  const outside = taskDb({ before: {
    id: 'task-2', assigneeId: 'staff-2', status: 'todo', dependsOn: '[]', assignee: { id: 'staff-2', teamId: 'other-team' },
  } });
  await assert.rejects(executeRealmRecordAction(outside.db, { id: 'staff-1', roles: ['STAFF'], teamId: 'delivery' }, {
    action: 'task.transition', entityId: 'task-2', expectedState: 'todo', nextState: 'in_progress', idempotencyKey: `${KEY}:outside`,
  }), (error) => error.status === 404 && error.code === 'realm_task_not_found');
});

test('AM chuyển Lead thuộc portfolio nhưng không thấy Lead của AM khác', async () => {
  const own = leadDb();
  const result = await executeRealmRecordAction(own.db, { id: 'am-1', name: 'Quang Võ', roles: ['AM'] }, {
    action: 'lead.transition', entityId: 'lead-1', expectedState: 'new', nextState: 'contacted', idempotencyKey: KEY,
  });
  assert.equal(result.resource, 'leads');
  assert.deepEqual(own.calls.update.where, { id: 'lead-1', stage: 'new' });
  assert.equal(own.calls.audit.entity, 'leads');

  const other = leadDb({ before: { id: 'lead-2', ownerId: 'am-2', stage: 'new' } });
  await assert.rejects(executeRealmRecordAction(other.db, { id: 'am-1', roles: ['AM'] }, {
    action: 'lead.transition', entityId: 'lead-2', expectedState: 'new', nextState: 'contacted', idempotencyKey: `${KEY}:other`,
  }), (error) => error.status === 404 && error.code === 'realm_lead_not_found');
});

test('Idempotent replay không đọc hoặc ghi lại record; key đổi payload trả conflict', async () => {
  const receipt = {
    id: 'receipt-1', idempotencyKey: KEY, userId: 'staff-1', action: 'task.transition',
    resource: 'tasks', entityId: 'task-1', fromState: 'todo', toState: 'in_progress',
  };
  const replay = taskDb({ receipt });
  const result = await executeRealmRecordAction(replay.db, { id: 'staff-1', roles: ['STAFF'] }, {
    action: 'task.transition', entityId: 'task-1', expectedState: 'todo', nextState: 'in_progress', idempotencyKey: KEY,
  });
  assert.equal(result.idempotent, true);
  assert.equal(replay.calls.taskReads, 0);
  assert.equal(replay.calls.update, null);

  await assert.rejects(executeRealmRecordAction(replay.db, { id: 'staff-1', roles: ['STAFF'] }, {
    action: 'task.transition', entityId: 'task-1', expectedState: 'todo', nextState: 'blocked', idempotencyKey: KEY,
  }), (error) => error.status === 409 && error.code === 'realm_action_idempotency_conflict');
});

test('compare-and-swap thua race trả stale và không phát receipt', async () => {
  const { db, calls } = taskDb({ updateCount: 0 });
  await assert.rejects(executeRealmRecordAction(db, { id: 'staff-1', roles: ['STAFF'], teamId: 'delivery' }, {
    action: 'task.transition', entityId: 'task-1', expectedState: 'todo', nextState: 'in_progress', idempotencyKey: KEY,
  }), (error) => error.status === 409 && error.code === 'realm_action_stale');
  assert.equal(calls.receipt, null);
  assert.equal(calls.audit, null);
});
