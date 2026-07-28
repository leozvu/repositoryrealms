import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRealmChronicle } from '../lib/realm-chronicle-admin.js';

function mockDb({ status = 'active', userType = 'employee' } = {}) {
  const calls = {};
  const db = {
    setting: { findUnique: async (args) => { calls.setting = args; return null; } },
    user: { findUnique: async (args) => {
      calls.user = args;
      return { id: 'staff-1', name: 'Mai Anh', title: 'Designer', teamId: 'team-1', status, userType, realmProfile: null };
    } },
    team: { findUnique: async (args) => { calls.team = args; return { id: 'team-1', name: 'Delivery Guild' }; } },
    task: { findMany: async (args) => { calls.tasks = args; return []; } },
    timeLog: { findMany: async (args) => { calls.timeLogs = args; return []; } },
    leave: { findMany: async (args) => { calls.leaves = args; return []; } },
    attendance: { findMany: async (args) => { calls.attendance = args; return []; } },
    approval: { findMany: async (args) => { calls.approvals = args; return []; } },
    realmGoldEntry: { findMany: async (args) => { calls.entries = args; return []; } },
  };
  return { db, calls };
}

test('Chronicle loader khóa mọi business query theo current user', async () => {
  const { db, calls } = mockDb();
  const result = await loadRealmChronicle(db, { id: 'staff-1', name: 'Mai Anh', roles: ['STAFF'], teamId: 'team-1' }, new Date('2026-07-18T12:00:00.000Z'));
  assert.deepEqual(calls.tasks.where, { assigneeId: 'staff-1' });
  assert.equal(calls.timeLogs.where.userId, 'staff-1');
  assert.equal(calls.leaves.where.userId, 'staff-1');
  assert.equal(calls.attendance.where.userId, 'staff-1');
  assert.deepEqual(calls.approvals.where, { requesterId: 'staff-1' });
  assert.deepEqual(calls.entries.where, { userId: 'staff-1' });
  assert.equal(result.privacy.scope, 'self');
});

test('Loader không select salary, rate, review score, note hoặc approval payload', async () => {
  const { db, calls } = mockDb();
  await loadRealmChronicle(db, { id: 'staff-1', roles: ['STAFF'], teamId: 'team-1' });
  const selects = JSON.stringify(calls);
  for (const forbidden of ['salary', 'hourlyRate', 'scores', 'mgrNote', 'selfNote', 'payload', 'note']) {
    assert.equal(selects.includes(`\"${forbidden}\"`), false, `${forbidden} must not be selected`);
  }
  assert.deepEqual(calls.user.select, { id: true, name: true, title: true, teamId: true, status: true, userType: true, realmProfile: true });
});

test('Loader từ chối hồ sơ inactive hoặc không phải nhân sự nội bộ trước khi đọc dữ liệu cá nhân', async () => {
  const inactive = mockDb({ status: 'inactive' });
  await assert.rejects(loadRealmChronicle(inactive.db, { id: 'staff-1', roles: ['STAFF'] }), (error) => error.code === 'realm_chronicle_profile_forbidden');
  assert.equal(inactive.calls.tasks, undefined);

  const freelancer = mockDb({ userType: 'freelancer' });
  await assert.rejects(loadRealmChronicle(freelancer.db, { id: 'staff-1', roles: ['STAFF'] }), (error) => error.code === 'realm_chronicle_profile_forbidden');
  assert.equal(freelancer.calls.entries, undefined);
});
