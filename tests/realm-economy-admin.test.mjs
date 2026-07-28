import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRealmEconomyDashboard, realmEconomyScope } from '../lib/realm-economy-admin.js';

const LEAD = { id: 'lead-1', name: 'Quang Võ', role: 'LEAD', roles: ['LEAD'], teamId: 'delivery' };
const DIRECTOR = { id: 'director-1', name: 'Sơn Vũ', role: 'DIRECTOR', roles: ['DIRECTOR'], teamId: null };

function dashboardDb() {
  const calls = { entryQueries: [], questWhere: null, budgetWhere: null };
  const user = { id: 'staff-1', name: 'Mai Anh', teamId: 'delivery', title: 'Designer' };
  return {
    calls,
    db: {
      realmGoldEntry: {
        findMany: async (args) => {
          calls.entryQueries.push(args);
          if (args.where.sourceType === 'task') return [{ sourceId: 'task-issued' }];
          return [{
            id: 'entry-1', userId: user.id, user, type: 'quest_reward', amount: 5, renown: 80,
            label: 'Quest complete', sourceType: 'task', sourceId: 'task-issued', createdAt: new Date('2026-07-05T10:00:00.000Z'),
          }];
        },
      },
      realmQuestConfig: {
        findMany: async (args) => {
          calls.questWhere = args.where;
          return [{
            id: 'reward-1', taskId: 'task-open', gold: 4, status: 'approved',
            task: { title: 'Open Quest', assigneeId: user.id, assignee: user },
          }];
        },
      },
      realmRewardBudget: {
        findUnique: async (args) => {
          calls.budgetWhere = args.where;
          return { period: '2026-07', goldCap: 160, perUserGoldCap: 50, status: 'approved', approvedAt: new Date('2026-07-01T00:00:00.000Z') };
        },
      },
    },
  };
}

test('STAFF bị chặn trước khi Gold Economy query database', async () => {
  const db = { realmGoldEntry: { findMany: async () => { throw new Error('must not query'); } } };
  await assert.rejects(
    loadRealmEconomyDashboard(db, { id: 'staff-1', name: 'Staff', role: 'STAFF' }),
    (error) => error.code === 'economy_forbidden',
  );
});

test('Lead chỉ query journal và commitment trong team của mình', async () => {
  const { db, calls } = dashboardDb();
  const result = await loadRealmEconomyDashboard(db, LEAD, new Date('2026-07-17T12:00:00.000Z'));
  assert.equal(result.permissions.scope, 'team');
  assert.equal(result.permissions.teamId, 'delivery');
  assert.equal(calls.entryQueries[0].where.user.teamId, 'delivery');
  assert.equal(calls.entryQueries[1].where.user.teamId, 'delivery');
  assert.equal(calls.questWhere.task.assignee.teamId, 'delivery');
  assert.deepEqual(calls.budgetWhere, { period: '2026-07' });
  assert.equal(result.metrics.issued, 5);
  assert.equal(result.metrics.committed, 4);
});

test('Director có company scope và query không gắn team filter', async () => {
  const { db, calls } = dashboardDb();
  const result = await loadRealmEconomyDashboard(db, DIRECTOR, new Date('2026-07-17T12:00:00.000Z'));
  assert.equal(realmEconomyScope(DIRECTOR), 'company');
  assert.equal(result.permissions.scope, 'company');
  assert.equal('user' in calls.entryQueries[0].where, false);
  assert.equal('task' in calls.questWhere, false);
  assert.equal(result.policy.cap, 160);
  assert.equal(result.policy.status, 'approved');
});

test('Lead thiếu team không được mở rộng mặc định sang company scope', () => {
  assert.equal(realmEconomyScope({ ...LEAD, teamId: null }), 'none');
});
