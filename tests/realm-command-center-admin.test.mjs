import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManageRealmAssignments,
  loadRealmCommandCenter,
  requestRealmTaskHandoff,
} from '../lib/realm-command-center-admin.js';

function readDb() {
  const calls = { users: null, tasks: null, logs: null, approvals: null };
  const db = {
    user: { findMany: async (args) => {
      calls.users = args;
      return [
        { id: 'lead-1', name: 'Lead', title: 'Lead', teamId: 'delivery', realmProfile: null },
        { id: 'staff-1', name: 'Mai Anh', title: 'Designer', teamId: 'delivery', realmProfile: null },
      ];
    } },
    task: { findMany: async (args) => {
      calls.tasks = args;
      return [{ id: 'task-1', title: 'Launch', status: 'todo', priority: 'high', dueDate: '2026-07-20', estHours: 8, assigneeId: 'staff-1', project: { id: 'project-1', name: 'EVA' } }];
    } },
    timeLog: { findMany: async (args) => { calls.logs = args; return [{ userId: 'staff-1', hours: 3 }]; } },
    approval: { findMany: async (args) => { calls.approvals = args; return []; } },
  };
  return { db, calls };
}

test('Command Center query Task, TimeLog và Approval đúng phạm vi team', async () => {
  const { db, calls } = readDb();
  const result = await loadRealmCommandCenter(db, { id: 'lead-1', name: 'Lead', roles: ['LEAD'], teamId: 'delivery' }, new Date('2026-07-18T12:00:00.000Z'));
  assert.deepEqual(calls.users.where, { teamId: 'delivery', status: 'active', userType: 'employee' });
  assert.deepEqual(calls.tasks.where, { assigneeId: { in: ['lead-1', 'staff-1'] } });
  assert.deepEqual(calls.logs.where.userId, { in: ['lead-1', 'staff-1'] });
  assert.equal(calls.logs.where.date.gte, '2026-07-13');
  assert.deepEqual(calls.approvals.where, { type: 'task_handoff', refId: { in: ['task-1'] }, status: 'pending' });
  assert.equal(result.permissions.scope, 'team');
  assert.equal(result.permissions.canAssign, true);
});

test('Director thấy cả Task chưa phân công nhưng STAFF chỉ xem self scope', async () => {
  const director = readDb();
  director.db.task.findMany = async (args) => { director.calls.tasks = args; return []; };
  await loadRealmCommandCenter(director.db, { id: 'director-1', roles: ['DIRECTOR'] });
  assert.deepEqual(director.calls.tasks.where, { OR: [{ assigneeId: { in: ['lead-1', 'staff-1'] } }, { assigneeId: null }] });
  assert.equal(canManageRealmAssignments({ id: 'director-1', roles: ['DIRECTOR'] }), true);
  assert.equal(canManageRealmAssignments({ id: 'staff-1', roles: ['STAFF'] }), false);

  const self = readDb();
  self.db.user.findMany = async (args) => { self.calls.users = args; return [{ id: 'staff-1', name: 'Mai Anh', teamId: null, realmProfile: null }]; };
  self.db.task.findMany = async (args) => { self.calls.tasks = args; return []; };
  await loadRealmCommandCenter(self.db, { id: 'staff-1', roles: ['STAFF'], teamId: null });
  assert.deepEqual(self.calls.users.where, { id: 'staff-1', status: 'active', userType: 'employee' });
  assert.deepEqual(self.calls.tasks.where, { assigneeId: { in: ['staff-1'] } });
});

function handoffDb({ targetTeam = 'delivery', duplicate = null } = {}) {
  const calls = { approval: null, audit: null };
  const tx = {
    approval: { create: async ({ data }) => { calls.approval = data; return { id: 'approval-1', ...data }; } },
    auditLog: { create: async ({ data }) => { calls.audit = data; return data; } },
  };
  return { calls, db: {
    task: { findUnique: async () => ({ id: 'task-1', title: 'Key visual', status: 'doing', assigneeId: 'staff-1', assignee: { teamId: 'delivery' } }) },
    user: { findUnique: async ({ where }) => where.id === 'lead-1'
      ? { id: 'lead-1', name: 'Trưởng Guild', status: 'active', userType: 'employee' }
      : { id: 'staff-2', name: 'Quốc Việt', teamId: targetTeam, status: 'active', userType: 'employee' } },
    team: { findUnique: async () => ({ leadId: 'lead-1' }) },
    approval: { findFirst: async () => duplicate },
    $transaction: async (fn) => fn(tx),
  } };
}

test('Nhân sự tạo Approval bàn giao có maker-checker và audit', async () => {
  const { db, calls } = handoffDb();
  const result = await requestRealmTaskHandoff(db, { id: 'staff-1', name: 'Mai Anh', roles: ['STAFF'], teamId: 'delivery' }, {
    taskId: 'task-1', targetAssigneeId: 'staff-2', note: 'Cần Việt tiếp quản phần dựng.',
  }, new Date('2026-07-18T12:00:00.000Z'));
  assert.equal(result.approval.id, 'approval-1');
  assert.deepEqual(result.approverIds, ['lead-1']);
  assert.equal(calls.approval.type, 'task_handoff');
  assert.equal(JSON.parse(calls.approval.steps)[0].userId, 'lead-1');
  assert.equal(JSON.parse(calls.approval.payload).expectedAssigneeId, 'staff-1');
  assert.equal(calls.audit.action, 'request');
});

test('Bàn giao ngoài team và yêu cầu trùng đều bị chặn trước transaction', async () => {
  const outside = handoffDb({ targetTeam: 'other' });
  await assert.rejects(requestRealmTaskHandoff(outside.db, { id: 'staff-1', roles: ['STAFF'], teamId: 'delivery' }, {
    taskId: 'task-1', targetAssigneeId: 'staff-2', note: 'Bàn giao',
  }), (error) => error.code === 'realm_handoff_target_outside_team');
  assert.equal(outside.calls.approval, null);

  const duplicate = handoffDb({ duplicate: { id: 'approval-existing' } });
  await assert.rejects(requestRealmTaskHandoff(duplicate.db, { id: 'staff-1', roles: ['STAFF'], teamId: 'delivery' }, {
    taskId: 'task-1', targetAssigneeId: 'staff-2', note: 'Bàn giao',
  }), (error) => error.code === 'realm_handoff_pending');
  assert.equal(duplicate.calls.approval, null);
});
