import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRealmGuildDashboard, realmGuildScope } from '../lib/realm-guild-admin.js';

function guildDb() {
  const calls = { team: null, users: null, tasks: null, entries: null };
  const members = [
    { id: 'lead-1', name: 'Minh Quân', title: 'Lead', realmProfile: { realmClass: 'Guild Master', color: '#3b8061' } },
    { id: 'staff-1', name: 'Mai Anh', title: 'Designer', realmProfile: null },
  ];
  return {
    calls,
    db: {
      team: { findUnique: async (args) => { calls.team = args; return { id: 'delivery', name: 'Delivery Guild', leadId: 'lead-1' }; } },
      user: { findMany: async (args) => { calls.users = args; return members; } },
      task: {
        findMany: async (args) => {
          calls.tasks = args;
          return [{
            id: 'task-1', title: 'Launch', status: 'done', dueDate: '2026-07-18', assigneeId: 'staff-1',
            project: { id: 'project-1', name: 'Rồng Xanh', status: 'active', progress: 70 },
            realmQuest: { active: true, approvedAt: new Date('2026-07-10') },
          }];
        },
      },
      realmGoldEntry: { findMany: async (args) => { calls.entries = args; return []; } },
    },
  };
}

test('Guild scope dùng RBAC công ty, team và self một cách tường minh', () => {
  assert.deepEqual(realmGuildScope({ id: 'staff-1', teamId: 'delivery' }), { kind: 'team', teamId: 'delivery' });
  assert.deepEqual(realmGuildScope({ id: 'director-1', roles: ['DIRECTOR'], teamId: null }), { kind: 'company' });
  assert.deepEqual(realmGuildScope({ id: 'pm-1', roles: ['PM'], teamId: null }), { kind: 'company' });
  assert.deepEqual(realmGuildScope({ id: 'hr-1', roles: ['HR'], teamId: null }), { kind: 'company' });
  assert.deepEqual(realmGuildScope({ id: 'accountant-1', roles: ['ACCOUNTANT'], teamId: null }), { kind: 'self', userId: 'accountant-1' });
  assert.deepEqual(realmGuildScope(null), { kind: 'none' });
});

test('ERP Guild chỉ query member và Task trong scope team hiện tại', async () => {
  const { db, calls } = guildDb();
  const dashboard = await loadRealmGuildDashboard(db, { id: 'staff-1', name: 'Mai Anh', teamId: 'delivery' }, new Date('2026-07-17T12:00:00.000Z'));
  assert.deepEqual(calls.team.where, { id: 'delivery' });
  assert.deepEqual(calls.users.where, { teamId: 'delivery', status: 'active', userType: 'employee' });
  assert.deepEqual(calls.tasks.where, { assigneeId: { in: ['lead-1', 'staff-1'] } });
  assert.deepEqual(calls.entries.where.sourceId, { in: ['task-1'] });
  assert.equal(dashboard.guild.name, 'Delivery Guild');
  assert.equal(dashboard.metrics.readyQuests, 1);
  assert.equal(dashboard.permissions.teamId, 'delivery');
});

test('Giám đốc nhận Guild công ty từ toàn bộ nhân sự active', async () => {
  const { db, calls } = guildDb();
  db.user.findMany = async (args) => {
    calls.users = args;
    return [
      { id: 'director-1', name: 'Sơn Vũ', title: 'Director', realmProfile: null },
      { id: 'staff-1', name: 'Mai Anh', title: 'Designer', realmProfile: null },
    ];
  };
  db.task.findMany = async (args) => { calls.tasks = args; return []; };
  const dashboard = await loadRealmGuildDashboard(db, { id: 'director-1', name: 'Sơn Vũ', roles: ['DIRECTOR'], teamId: null }, new Date('2026-07-17T12:00:00.000Z'));
  assert.equal(calls.team, null);
  assert.deepEqual(calls.users.where, { status: 'active', userType: 'employee' });
  assert.deepEqual(calls.tasks.where, { assigneeId: { in: ['director-1', 'staff-1'] } });
  assert.equal(calls.entries, null);
  assert.equal(dashboard.permissions.scope, 'company');
  assert.equal(dashboard.permissions.teamId, null);
  assert.equal(dashboard.guild.name, 'Company Adventurers Guild');
  assert.equal(dashboard.metrics.members, 2);
});

test('Nhân sự không có team chỉ nhận hồ sơ của chính mình', async () => {
  const { db, calls } = guildDb();
  db.user.findMany = async (args) => {
    calls.users = args;
    return [{ id: 'staff-1', name: 'Mai Anh', title: 'Designer', realmProfile: null }];
  };
  db.task.findMany = async (args) => { calls.tasks = args; return []; };
  const dashboard = await loadRealmGuildDashboard(db, { id: 'staff-1', name: 'Mai Anh', roles: ['STAFF'], teamId: null }, new Date('2026-07-17T12:00:00.000Z'));
  assert.deepEqual(calls.users.where, { id: 'staff-1', status: 'active', userType: 'employee' });
  assert.equal(dashboard.permissions.scope, 'self');
  assert.equal(dashboard.metrics.members, 1);
});

test('Thiếu identity bị chặn trước database query', async () => {
  const db = { team: { findUnique: async () => { throw new Error('must not query'); } } };
  await assert.rejects(loadRealmGuildDashboard(db, null), (error) => error.code === 'guild_scope_missing');
});
