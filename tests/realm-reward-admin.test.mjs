import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRealmRewardAdminAction, loadRealmRewardDashboard } from '../lib/realm-reward-admin.js';

const PM = { id: 'pm-1', name: 'Minh Quân', role: 'PM', roles: ['PM'], teamId: null };
const HR = { id: 'hr-1', name: 'Lan Phạm', role: 'HR', roles: ['HR'], teamId: null };
const DIRECTOR_A = { id: 'director-1', name: 'Sơn Vũ', role: 'DIRECTOR', roles: ['DIRECTOR'], teamId: null };
const DIRECTOR_B = { id: 'director-2', name: 'Minh Trần', role: 'DIRECTOR', roles: ['DIRECTOR'], teamId: null };

function task(config = null) {
  return {
    id: 'task-1', title: 'Launch checklist', assigneeId: 'staff-1', status: 'done',
    assignee: { id: 'staff-1', name: 'Mai Anh', teamId: 'team-1' },
    project: { id: 'project-1', name: 'Rồng Xanh' }, realmQuest: config,
  };
}

function transactionDb(taskRow, extras = {}) {
  const state = { events: [], audits: [], updated: null, options: null };
  const tx = {
    task: { findUnique: async () => taskRow },
    realmGoldEntry: {
      findFirst: async () => null,
      findMany: async () => extras.entries || [],
    },
    realmRewardBudget: { findUnique: async () => extras.budget || null },
    realmQuestConfig: {
      upsert: async ({ create }) => ({ id: 'reward-1', version: 1, ...create }),
      update: async ({ data }) => {
        state.updated = data;
        return { ...taskRow.realmQuest, ...data, version: (taskRow.realmQuest?.version || 0) + 1 };
      },
      findMany: async () => extras.approvedConfigs || [],
    },
    taskEvent: { create: async ({ data }) => { state.events.push(data); return data; } },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return {
    state,
    db: {
      $transaction: async (callback, options) => { state.options = options; return callback(tx); },
    },
  };
}

function budgetTransactionDb(current = null, extras = {}) {
  const state = { audits: [], updated: null, upserted: null, options: null };
  const tx = {
    realmRewardBudget: {
      findUnique: async () => current,
      upsert: async ({ create, update }) => {
        const data = current ? update : create;
        state.upserted = data;
        return { id: current?.id || 'budget-1', version: (current?.version || 0) + 1, ...current, ...data };
      },
      update: async ({ data }) => {
        state.updated = data;
        return { ...current, ...data, version: (current?.version || 0) + 1 };
      },
    },
    realmGoldEntry: {
      findMany: async ({ where }) => where.sourceType === 'task' ? (extras.issuedEntries || []) : (extras.entries || []),
    },
    realmQuestConfig: { findMany: async () => extras.approvedConfigs || [] },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return {
    state,
    db: { $transaction: async (callback, options) => { state.options = options; return callback(tx); } },
  };
}

test('STAFF không thể đọc Reward Control Center trước khi query database', async () => {
  const db = { task: { findMany: async () => { throw new Error('must not query'); } } };
  await assert.rejects(
    loadRealmRewardDashboard(db, { id: 'staff-1', name: 'Staff', role: 'STAFF' }),
    (error) => error.code === 'reward_forbidden',
  );
});

test('PM lưu draft trong transaction và tạo TaskEvent + AuditLog', async () => {
  const { db, state } = transactionDb(task());
  const result = await applyRealmRewardAdminAction(db, PM, {
    action: 'save-draft', taskId: 'task-1', version: 0, gold: 5, renown: 120,
    note: 'Đủ checklist và nghiệm thu đúng hạn.',
  }, new Date('2026-07-17T10:00:00.000Z'));
  assert.equal(result.type, 'save-draft');
  assert.equal(state.events.length, 1);
  assert.equal(state.audits[0].action, 'realm_reward_draft');
  assert.deepEqual(state.options, { isolationLevel: 'Serializable' });
});

test('HR approve reward qua budget check và không thể approve reward do chính mình cấu hình', async () => {
  const config = {
    id: 'reward-1', taskId: 'task-1', gold: 5, renown: 120, active: true,
    status: 'pending', configuredById: PM.id, version: 2,
  };
  const { db, state } = transactionDb(task(config), {
    entries: [{ amount: 20, userId: 'someone', sourceId: 'task-old' }],
    approvedConfigs: [{ gold: 10, taskId: 'task-open', task: { assigneeId: 'staff-2' } }],
  });
  const result = await applyRealmRewardAdminAction(db, HR, {
    action: 'approve', taskId: 'task-1', version: 2, reviewNote: 'Phù hợp policy.',
  }, new Date('2026-07-17T10:00:00.000Z'));
  assert.equal(result.type, 'approve');
  assert.equal(state.updated.status, 'approved');
  assert.equal(state.updated.approvedById, HR.id);

  const selfConfig = { ...config, configuredById: HR.id };
  const selfDb = transactionDb(task(selfConfig)).db;
  await assert.rejects(
    applyRealmRewardAdminAction(selfDb, HR, { action: 'approve', taskId: 'task-1', version: 2 }),
    (error) => error.code === 'self_approval_forbidden',
  );
});

test('Director tạo budget draft bằng transaction và ghi AuditLog', async () => {
  const { db, state } = budgetTransactionDb();
  const result = await applyRealmRewardAdminAction(db, DIRECTOR_A, {
    action: 'budget-save-draft', version: 0, goldCap: 180, perUserGoldCap: 55,
    note: 'Tăng hạn mức cho chiến dịch mùa thu.',
  }, new Date('2026-07-17T10:00:00.000Z'));
  assert.equal(result.type, 'budget-save-draft');
  assert.equal(state.upserted.goldCap, 180);
  assert.equal(state.upserted.status, 'draft');
  assert.equal(state.audits[0].action, 'realm_budget_draft');
  assert.deepEqual(state.options, { isolationLevel: 'Serializable' });
});

test('Budget maker/checker chặn tự duyệt và cap thấp hơn nghĩa vụ hiện hữu', async () => {
  const pending = {
    id: 'budget-1', period: '2026-07', goldCap: 60, perUserGoldCap: 30,
    note: 'Budget chờ checker duyệt.', status: 'pending', configuredById: DIRECTOR_A.id, version: 2,
  };
  const { db, state } = budgetTransactionDb(pending, {
    entries: [{ amount: 20, userId: 'staff-1', sourceId: 'issued-task' }],
    issuedEntries: [{ sourceId: 'issued-task' }],
    approvedConfigs: [{ gold: 10, taskId: 'open-task', task: { assigneeId: 'staff-2' } }],
  });
  const result = await applyRealmRewardAdminAction(db, DIRECTOR_B, {
    action: 'budget-approve', version: 2, reviewNote: 'Đã đối chiếu kế hoạch.',
  }, new Date('2026-07-17T10:00:00.000Z'));
  assert.equal(result.type, 'budget-approve');
  assert.equal(state.updated.status, 'approved');
  assert.equal(state.updated.approvedById, DIRECTOR_B.id);

  await assert.rejects(
    applyRealmRewardAdminAction(budgetTransactionDb(pending).db, DIRECTOR_A, { action: 'budget-approve', version: 2 }),
    (error) => error.code === 'self_approval_forbidden',
  );

  const tooLow = { ...pending, goldCap: 25 };
  await assert.rejects(
    applyRealmRewardAdminAction(budgetTransactionDb(tooLow, {
      entries: [{ amount: 20, userId: 'staff-1', sourceId: 'issued-task' }],
      issuedEntries: [{ sourceId: 'issued-task' }],
      approvedConfigs: [{ gold: 10, taskId: 'open-task', task: { assigneeId: 'staff-2' } }],
    }).db, DIRECTOR_B, { action: 'budget-approve', version: 2 }),
    (error) => error.code === 'budget_below_existing_commitments',
  );
});
