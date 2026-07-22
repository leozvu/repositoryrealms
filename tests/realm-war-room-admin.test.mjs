import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRealmWarRoomDashboard } from '../lib/realm-war-room-admin.js';

function warRoomDb() {
  const calls = { team: null, users: null, tasks: null, project: null, phases: null, milestones: null, entries: null, comments: null };
  return {
    calls,
    db: {
      team: { findUnique: async (args) => { calls.team = args; return { id: 'delivery', name: 'Delivery Guild', leadId: 'lead-1' }; } },
      user: { findMany: async (args) => { calls.users = args; return [{ id: 'lead-1', name: 'Minh Quân' }, { id: 'staff-1', name: 'Mai Anh' }]; } },
      task: { findMany: async (args) => { calls.tasks = args; return [{ id: 'task-1', title: 'Launch', status: 'done', priority: 'high', dueDate: '2026-07-18', dependsOn: '[]', checklist: '[]', phaseId: 'phase-1', assignee: { id: 'staff-1', name: 'Mai Anh' }, realmQuest: { active: true, approvedAt: new Date('2026-07-16') } }]; } },
      project: { findUnique: async (args) => { calls.project = args; return { id: 'project-1', name: 'Rồng Xanh', status: 'active', startDate: '2026-07-01', deadline: '2026-07-20', progress: 70, autoProgress: true }; } },
      phase: { findMany: async (args) => { calls.phases = args; return [{ id: 'phase-1', name: 'Launch', order: 0, color: '#336655' }]; } },
      milestone: { findMany: async (args) => { calls.milestones = args; return [{ id: 'ms-1', name: 'Go live', date: '2026-07-20', done: false }]; } },
      realmGoldEntry: { findMany: async (args) => { calls.entries = args; return []; } },
      taskComment: { findMany: async (args) => { calls.comments = args; return [{ id: 'comment-1', taskId: 'task-1', userId: 'staff-1', content: 'Đã chốt phương án', createdAt: new Date('2026-07-17T10:00:00.000Z') }]; } },
    },
  };
}

test('ERP War Room chỉ query Task của Project trong member scope hiện tại', async () => {
  const { db, calls } = warRoomDb();
  const dashboard = await loadRealmWarRoomDashboard(db, { id: 'staff-1', teamId: 'delivery' }, 'project-1', new Date('2026-07-17T12:00:00.000Z'));
  assert.deepEqual(calls.users.where, { teamId: 'delivery', status: 'active', userType: 'employee' });
  assert.deepEqual(calls.tasks.where, { projectId: 'project-1', assigneeId: { in: ['lead-1', 'staff-1'] } });
  assert.deepEqual(calls.project.where, { id: 'project-1' });
  assert.deepEqual(calls.entries.where.sourceId, { in: ['task-1'] });
  assert.deepEqual(calls.comments.where.taskId, { in: ['task-1'] });
  assert.equal(dashboard.source, 'erp');
  assert.equal(dashboard.campaign.owner, 'Minh Quân');
  assert.equal(dashboard.permissions.teamId, 'delivery');
  assert.equal(dashboard.phases[0].tasks[0].comments[0].author, 'Mai Anh');
});

test('Project không có Task trong Guild trả 404 trước khi đọc metadata Project', async () => {
  const { db, calls } = warRoomDb();
  db.task.findMany = async (args) => { calls.tasks = args; return []; };
  await assert.rejects(
    loadRealmWarRoomDashboard(db, { id: 'staff-1', teamId: 'delivery' }, 'secret-project'),
    (error) => error.status === 404 && error.code === 'campaign_not_found',
  );
  assert.equal(calls.project, null);
  assert.equal(calls.phases, null);
  assert.equal(calls.entries, null);
});

test('Giám đốc mở được Task công ty trong chiến dịch', async () => {
  const { db, calls } = warRoomDb();
  db.user.findMany = async (args) => { calls.users = args; return [{ id: 'director-1', name: 'Sơn Vũ' }, { id: 'staff-1', name: 'Mai Anh' }]; };
  const dashboard = await loadRealmWarRoomDashboard(db, { id: 'director-1', roles: ['DIRECTOR'], teamId: null }, 'project-1');
  assert.equal(calls.team, null);
  assert.deepEqual(calls.users.where, { status: 'active', userType: 'employee' });
  assert.deepEqual(calls.tasks.where.assigneeId, { in: ['director-1', 'staff-1'] });
  assert.equal(dashboard.permissions.scope, 'company');
});

test('User không có team chỉ mở Task của chính mình trong chiến dịch', async () => {
  const { db, calls } = warRoomDb();
  db.user.findMany = async (args) => { calls.users = args; return [{ id: 'staff-1', name: 'Mai Anh' }]; };
  const dashboard = await loadRealmWarRoomDashboard(db, { id: 'staff-1', roles: ['STAFF'], teamId: null }, 'project-1');
  assert.deepEqual(calls.users.where, { id: 'staff-1', status: 'active', userType: 'employee' });
  assert.deepEqual(calls.tasks.where.assigneeId, { in: ['staff-1'] });
  assert.equal(dashboard.permissions.scope, 'self');
});

test('War Room chặn projectId không hợp lệ trước database query', async () => {
  const db = { team: { findUnique: async () => { throw new Error('must not query'); } } };
  await assert.rejects(
    loadRealmWarRoomDashboard(db, { id: 'staff-1', teamId: 'delivery' }, '../outside'),
    (error) => error.status === 400 && error.code === 'campaign_id_invalid',
  );
});
