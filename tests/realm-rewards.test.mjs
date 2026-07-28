import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRealmRewardDemoAction,
  assertRealmRewardBudgetAvailable,
  calculateRealmRewardBudget,
  createRealmRewardDemoDashboard,
  normalizeRealmBudgetDraft,
  normalizeRealmRewardDraft,
  realmRewardPeriod,
  realmRewardPeriodRange,
  realmRewardPermissions,
} from '../lib/realm-rewards.js';

const QUESTS = [
  { id: 'q1', businessRef: 'TASK-1', title: 'Launch', project: 'Rồng Xanh', owner: 'Mai Anh', reward: 5, renown: 120, status: 'ready' },
  { id: 'q2', businessRef: 'TASK-2', title: 'Leads', project: 'Sales', owner: 'Quang Võ', reward: 3, renown: 80, status: 'active' },
  { id: 'q3', businessRef: 'TASK-3', title: 'Landing', project: 'Web', owner: 'Nghĩa Nguyễn', reward: 2, renown: 60, status: 'active' },
];

test('RBAC reward tách maker, checker và budget owner', () => {
  assert.deepEqual(realmRewardPermissions({ role: 'PM' }), {
    canView: true, canConfigure: true, canApprove: false, canManageBudget: false,
    canConfigureBudget: false, canApproveBudget: false, roles: ['PM'],
  });
  assert.deepEqual(realmRewardPermissions({ role: 'HR' }), {
    canView: true, canConfigure: false, canApprove: true, canManageBudget: false,
    canConfigureBudget: false, canApproveBudget: false, roles: ['HR'],
  });
  const director = realmRewardPermissions({ role: 'DIRECTOR' });
  assert.equal(director.canConfigure, true);
  assert.equal(director.canApprove, true);
  assert.equal(director.canManageBudget, true);
  assert.equal(director.canConfigureBudget, true);
  assert.equal(director.canApproveBudget, true);
  assert.equal(realmRewardPermissions({ role: 'STAFF' }).canView, false);
});

test('budget draft kiểm tra cap, tỷ lệ và lý do', () => {
  assert.deepEqual(normalizeRealmBudgetDraft({ goldCap: '180', perUserGoldCap: '55', note: 'Tăng hạn mức cho chiến dịch mùa thu.' }), {
    goldCap: 180, perUserGoldCap: 55, note: 'Tăng hạn mức cho chiến dịch mùa thu.',
  });
  assert.throws(
    () => normalizeRealmBudgetDraft({ goldCap: 100, perUserGoldCap: 120, note: 'Lý do cấu hình hợp lệ.' }),
    (error) => error.code === 'invalid_budget_cap_ratio',
  );
  assert.throws(
    () => normalizeRealmBudgetDraft({ goldCap: 10001, perUserGoldCap: 45, note: 'Lý do cấu hình hợp lệ.' }),
    (error) => error.code === 'invalid_budget_gold_cap',
  );
});

test('reward draft chặn Gold/Renown vượt policy và bắt buộc lý do', () => {
  assert.deepEqual(normalizeRealmRewardDraft({ gold: '5', renown: '120', note: 'Bàn giao đủ tiêu chí.' }), {
    gold: 5, renown: 120, note: 'Bàn giao đủ tiêu chí.',
  });
  assert.throws(() => normalizeRealmRewardDraft({ gold: 21, renown: 10, note: 'Lý do hợp lệ.' }), (error) => error.code === 'invalid_reward_gold');
  assert.throws(() => normalizeRealmRewardDraft({ gold: 5, renown: 501, note: 'Lý do hợp lệ.' }), (error) => error.code === 'invalid_reward_renown');
  assert.throws(() => normalizeRealmRewardDraft({ gold: 5, renown: 10, note: 'Ngắn' }), (error) => error.code === 'invalid_reward_note');
});

test('budget tính issued + committed, không coi pending là đã dùng', () => {
  const budget = calculateRealmRewardBudget({ cap: 140, perUserCap: 45, issued: 20, committed: 15, pending: 9 });
  assert.deepEqual(budget, {
    cap: 140, perUserCap: 45, issued: 20, committed: 15, pending: 9,
    used: 35, remaining: 105, utilization: 25, overCap: false,
  });
  assert.throws(
    () => assertRealmRewardBudgetAvailable({ budget: { ...budget, cap: 40 }, proposedGold: 6 }),
    (error) => error.code === 'monthly_gold_cap_exceeded',
  );
  assert.throws(
    () => assertRealmRewardBudgetAvailable({ budget, proposedGold: 6, userIssued: 30, userCommitted: 10 }),
    (error) => error.code === 'user_gold_cap_exceeded',
  );
});

test('local governance sandbox chạy draft → pending → approved và cập nhật budget', () => {
  let dashboard = createRealmRewardDemoDashboard(QUESTS);
  const draft = dashboard.rows.find((row) => row.taskId === 'TASK-3');
  dashboard = applyRealmRewardDemoAction(dashboard, {
    type: 'save-draft', taskId: draft.taskId, gold: 6, renown: 150, note: 'Tăng reward theo phạm vi nghiệm thu mới.',
  });
  assert.equal(dashboard.rows[2].status, 'draft');
  assert.equal(dashboard.rows[2].version, 2);
  dashboard = applyRealmRewardDemoAction(dashboard, { type: 'submit', taskId: 'TASK-3' });
  assert.equal(dashboard.rows[2].status, 'pending');
  const before = dashboard.budget.committed;
  dashboard = applyRealmRewardDemoAction(dashboard, { type: 'approve', taskId: 'TASK-3' });
  assert.equal(dashboard.rows[2].status, 'approved');
  assert.equal(dashboard.budget.committed, before + 6);
});

test('maker không thể tự approve và reject bắt buộc lý do', () => {
  const dashboard = createRealmRewardDemoDashboard(QUESTS);
  const pending = dashboard.rows.find((row) => row.status === 'pending');
  const selfApproval = { ...dashboard, actor: { id: pending.configuredById, name: pending.configuredBy } };
  assert.throws(
    () => applyRealmRewardDemoAction(selfApproval, { type: 'approve', taskId: pending.taskId }),
    (error) => error.code === 'self_approval_forbidden',
  );
  assert.throws(
    () => applyRealmRewardDemoAction(dashboard, { type: 'reject', taskId: pending.taskId, reviewNote: 'Ngắn' }),
    (error) => error.code === 'review_note_required',
  );
  const rejected = applyRealmRewardDemoAction(dashboard, { type: 'reject', taskId: pending.taskId, reviewNote: 'Cần mô tả lại tiêu chí nghiệm thu.' });
  assert.equal(rejected.rows.find((row) => row.taskId === pending.taskId).status, 'rejected');
});

test('local budget chạy pending → approved, đổi effective cap và khóa kỳ', () => {
  let dashboard = createRealmRewardDemoDashboard(QUESTS);
  const pending = dashboard.budget.configuration;
  assert.equal(pending.status, 'pending');
  assert.equal(dashboard.budget.cap, 140);
  dashboard = applyRealmRewardDemoAction(dashboard, {
    type: 'budget-approve', version: pending.version, reviewNote: 'Phù hợp kế hoạch tháng.',
  });
  assert.equal(dashboard.budget.configuration.status, 'approved');
  assert.equal(dashboard.budget.configuration.version, 2);
  assert.equal(dashboard.budget.cap, 160);
  assert.equal(dashboard.budget.perUserCap, 50);
  assert.equal(dashboard.budget.policyStatus, 'approved');
  assert.throws(
    () => applyRealmRewardDemoAction(dashboard, {
      type: 'budget-save-draft', version: 2, goldCap: 180, perUserGoldCap: 60, note: 'Không được sửa budget đã chốt.',
    }),
    (error) => error.code === 'budget_already_approved',
  );
});

test('local budget chặn self-approval và reject thiếu lý do', () => {
  const dashboard = createRealmRewardDemoDashboard(QUESTS);
  const pending = dashboard.budget.configuration;
  const self = { ...dashboard, actor: { id: pending.configuredById, name: pending.configuredBy } };
  assert.throws(
    () => applyRealmRewardDemoAction(self, { type: 'budget-approve', version: pending.version }),
    (error) => error.code === 'self_approval_forbidden',
  );
  assert.throws(
    () => applyRealmRewardDemoAction(dashboard, { type: 'budget-reject', version: pending.version, reviewNote: 'Ngắn' }),
    (error) => error.code === 'review_note_required',
  );
});

test('kỳ reward dùng UTC month range ổn định', () => {
  assert.equal(realmRewardPeriod(new Date('2026-07-31T23:00:00.000Z')), '2026-07');
  const range = realmRewardPeriodRange('2026-07');
  assert.equal(range.start.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-08-01T00:00:00.000Z');
});
