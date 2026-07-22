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
      findFirst: async () => extras.issued || null,
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

test('Reward dashboard tổng hợp policy đã duyệt, issued, committed và quyền từng dòng', async () => {
  const approvedAt = new Date('2026-07-05T08:00:00.000Z');
  const tasks = [
    task({
      id: 'reward-1', taskId: 'task-1', gold: 12, renown: 80, status: 'approved', active: true,
      configuredById: PM.id, configuredBy: { name: PM.name }, approvedBy: { name: HR.name }, approvedAt, version: 3,
    }),
    { ...task({ id: 'reward-2', gold: 7, renown: 30, status: 'pending', configuredById: PM.id, version: 1 }), id: 'task-2', assigneeId: 'staff-2' },
    { ...task(), id: 'task-3', assigneeId: 'staff-3', project: null },
  ];
  const db = {
    task: { findMany: async () => tasks },
    realmRewardBudget: { findUnique: async () => ({
      id: 'budget-1', period: '2026-07', goldCap: 200, perUserGoldCap: 60, status: 'approved',
      version: 2, configuredById: DIRECTOR_A.id, configuredBy: { name: DIRECTOR_A.name },
      approvedById: DIRECTOR_B.id, approvedBy: { name: DIRECTOR_B.name }, approvedAt,
    }) },
    realmGoldEntry: {
      findMany: async ({ where }) => where.sourceType === 'task'
        ? [{ sourceId: 'task-2' }]
        : [{ amount: 15, userId: 'staff-9', sourceId: 'task-old' }, { amount: -5, userId: 'staff-9' }],
    },
  };
  const dashboard = await loadRealmRewardDashboard(db, DIRECTOR_A, new Date('2026-07-17T10:00:00.000Z'));
  assert.equal(dashboard.budget.policyStatus, 'approved');
  assert.equal(dashboard.budget.issued, 15);
  assert.equal(dashboard.budget.committed, 12);
  assert.equal(dashboard.budget.pending, 7);
  assert.equal(dashboard.rows[0].canConfigure, true);
  assert.equal(dashboard.rows[1].rewardIssued, true);
  assert.equal(dashboard.rows[1].canApprove, false);
  assert.equal(dashboard.rows[2].project, 'Công việc nội bộ');
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

test('Reward lifecycle hỗ trợ submit, reject và chặn version/ràng buộc Task', async () => {
  const draft = { id: 'reward-1', taskId: 'task-1', gold: 5, renown: 120, status: 'draft', configuredById: PM.id, version: 1 };
  const submitted = transactionDb(task(draft));
  assert.equal((await applyRealmRewardAdminAction(submitted.db, PM, { action: 'submit', taskId: 'task-1', version: 1 })).type, 'submit');
  assert.equal(submitted.state.updated.status, 'pending');

  const pending = { ...draft, status: 'pending', version: 2 };
  const rejected = transactionDb(task(pending));
  assert.equal((await applyRealmRewardAdminAction(rejected.db, HR, {
    action: 'reject', taskId: 'task-1', version: 2, reviewNote: 'Cần làm rõ tiêu chí nghiệm thu.',
  })).type, 'reject');
  assert.equal(rejected.state.updated.status, 'rejected');

  await assert.rejects(
    applyRealmRewardAdminAction(transactionDb(task(draft)).db, PM, { action: 'submit', taskId: 'task-1', version: 99 }),
    (error) => error.code === 'reward_version_conflict',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(transactionDb(null).db, PM, { action: 'save-draft', taskId: 'missing', version: 0, gold: 5, renown: 10 }),
    (error) => error.code === 'task_not_found',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(transactionDb({ ...task(), assigneeId: null }).db, PM, { action: 'save-draft', taskId: 'task-1', version: 0, gold: 5, renown: 10 }),
    (error) => error.code === 'task_unassigned',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(transactionDb(task(draft), { issued: { id: 'gold-1' } }).db, PM, { action: 'submit', taskId: 'task-1', version: 1 }),
    (error) => error.code === 'reward_already_issued',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(transactionDb(task(pending)).db, HR, { action: 'unknown', taskId: 'task-1', version: 2 }),
    (error) => error.code === 'unsupported_reward_action',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(transactionDb(task()).db, PM, { action: 'save-draft', taskId: '' }),
    (error) => error.code === 'invalid_task_id',
  );
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

test('Budget lifecycle hỗ trợ submit/reject và khóa conflict, permission, user cap', async () => {
  const draft = {
    id: 'budget-1', period: '2026-07', goldCap: 100, perUserGoldCap: 20,
    note: 'Budget draft.', status: 'draft', configuredById: DIRECTOR_A.id, version: 1,
  };
  const submit = budgetTransactionDb(draft);
  assert.equal((await applyRealmRewardAdminAction(submit.db, DIRECTOR_A, { action: 'budget-submit', version: 1 })).type, 'budget-submit');
  assert.equal(submit.state.updated.status, 'pending');

  const pending = { ...draft, status: 'pending', version: 2 };
  const reject = budgetTransactionDb(pending);
  assert.equal((await applyRealmRewardAdminAction(reject.db, DIRECTOR_B, {
    action: 'budget-reject', version: 2, reviewNote: 'Cần bổ sung dự báo campaign.',
  })).type, 'budget-reject');
  assert.equal(reject.state.updated.status, 'rejected');

  await assert.rejects(
    applyRealmRewardAdminAction(budgetTransactionDb(pending).db, DIRECTOR_B, { action: 'budget-approve', version: 99 }),
    (error) => error.code === 'budget_version_conflict',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(budgetTransactionDb().db, DIRECTOR_A, { action: 'budget-submit', version: 0 }),
    (error) => error.code === 'budget_not_configured',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(budgetTransactionDb(pending).db, HR, { action: 'budget-approve', version: 2 }),
    (error) => error.code === 'budget_forbidden',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(budgetTransactionDb(pending).db, DIRECTOR_B, { action: 'budget-unknown', version: 2 }),
    (error) => error.code === 'unsupported_budget_action',
  );
  await assert.rejects(
    applyRealmRewardAdminAction(budgetTransactionDb({ ...pending, perUserGoldCap: 5 }, {
      entries: [{ amount: 10, userId: 'staff-1', sourceId: 'issued-task' }],
      issuedEntries: [{ sourceId: 'issued-task' }],
    }).db, DIRECTOR_B, { action: 'budget-approve', version: 2 }),
    (error) => error.code === 'budget_below_user_commitments',
  );
});
