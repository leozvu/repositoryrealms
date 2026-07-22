import { isDirector, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-erp-adapter.js';
import {
  REALM_REWARD_LIMITS,
  assertRealmRewardBudgetAvailable,
  calculateRealmRewardBudget,
  normalizeRealmBudgetDraft,
  normalizeRealmRewardDraft,
  normalizeRealmRewardReviewNote,
  realmRewardPeriod,
  realmRewardPeriodRange,
  realmRewardPermissions,
} from './realm-rewards.js';

function requirePermission(condition, message, code = 'reward_forbidden') {
  if (!condition) throw new RealmOperationError(message, 403, code);
}

function rewardStatus(config) {
  if (!config) return 'unconfigured';
  if (config.status) return config.status;
  return config.approvedAt ? 'approved' : 'draft';
}

function canConfigureTask(user, task) {
  if (isDirector(user) || rolesOf(user).includes('PM')) return true;
  return rolesOf(user).includes('LEAD') && Boolean(user.teamId) && task?.assignee?.teamId === user.teamId;
}

function effectiveBudget(row) {
  const approved = row?.status === 'approved' && row.approvedAt;
  const configuration = row ? {
    id: row.id,
    period: row.period,
    goldCap: row.goldCap,
    perUserGoldCap: row.perUserGoldCap,
    note: row.note || '',
    status: row.status,
    version: row.version || 1,
    configuredBy: row.configuredBy?.name || null,
    configuredById: row.configuredById || null,
    configuredAt: row.configuredAt || null,
    approvedBy: row.approvedBy?.name || null,
    approvedById: row.approvedById || null,
    approvedAt: row.approvedAt || null,
    reviewNote: row.reviewNote || '',
  } : null;
  return {
    cap: approved ? row.goldCap : REALM_REWARD_LIMITS.defaultMonthlyGoldCap,
    perUserCap: approved ? row.perUserGoldCap : REALM_REWARD_LIMITS.defaultPerUserGoldCap,
    policyStatus: approved ? 'approved' : 'default-policy',
    configuredCap: row ? { goldCap: row.goldCap, perUserGoldCap: row.perUserGoldCap, status: row.status } : null,
    configuration,
  };
}

function dashboardFromRows({ user, period, tasks, budgetRow, entries, issuedEntries }) {
  const permissions = realmRewardPermissions(user);
  const issuedSourceIds = new Set(issuedEntries.filter((entry) => entry.sourceId).map((entry) => entry.sourceId));
  const issued = entries.reduce((sum, entry) => sum + Math.max(0, entry.amount || 0), 0);
  const rows = tasks.map((task) => {
    const config = task.realmQuest;
    const status = rewardStatus(config);
    const rewardIssued = issuedSourceIds.has(task.id);
    return {
      id: config?.id || `unconfigured:${task.id}`,
      taskId: task.id,
      title: task.title,
      project: task.project?.name || 'Công việc nội bộ',
      assignee: task.assignee?.name || 'Chưa giao',
      assigneeId: task.assigneeId,
      gold: config?.gold || 0,
      renown: config?.renown || 0,
      note: config?.note || '',
      status,
      configuredBy: config?.configuredBy?.name || null,
      configuredById: config?.configuredById || null,
      configuredAt: config?.configuredAt || null,
      approvedBy: config?.approvedBy?.name || null,
      approvedAt: config?.approvedAt || null,
      reviewNote: config?.reviewNote || '',
      rewardIssued,
      version: config?.version || 0,
      canConfigure: permissions.canConfigure && canConfigureTask(user, task) && !rewardIssued,
      canApprove: permissions.canApprove && status === 'pending' && config?.configuredById !== user.id && !rewardIssued,
    };
  });
  const committed = rows.filter((row) => row.status === 'approved' && !row.rewardIssued).reduce((sum, row) => sum + row.gold, 0);
  const pending = rows.filter((row) => row.status === 'pending').reduce((sum, row) => sum + row.gold, 0);
  const policy = effectiveBudget(budgetRow);
  return {
    source: 'erp',
    period,
    actor: { id: user.id, name: user.name, roleLabel: rolesOf(user).join(' + ') },
    permissions,
    budget: {
      ...calculateRealmRewardBudget({ ...policy, issued, committed, pending }),
      policyStatus: policy.policyStatus,
      configuredCap: policy.configuredCap,
      configuration: policy.configuration,
    },
    rows,
  };
}

export async function loadRealmRewardDashboard(db, user, now = new Date()) {
  const permissions = realmRewardPermissions(user);
  requirePermission(permissions.canView, 'Bạn không có quyền xem Reward Control Center.');
  const period = realmRewardPeriod(now);
  const { start, end } = realmRewardPeriodRange(period);
  const [tasks, budgetRow, entries, issuedEntries] = await Promise.all([
    db.task.findMany({
      where: { assigneeId: { not: null } },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, teamId: true } },
        realmQuest: {
          include: {
            configuredBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      take: 100,
    }),
    db.realmRewardBudget.findUnique({
      where: { period },
      include: {
        configuredBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    }),
    db.realmGoldEntry.findMany({
      where: { type: 'quest_reward', createdAt: { gte: start, lt: end } },
      select: { amount: true, userId: true, sourceId: true },
    }),
    db.realmGoldEntry.findMany({
      where: { type: 'quest_reward', sourceType: 'task' },
      select: { sourceId: true },
    }),
  ]);
  return dashboardFromRows({ user, period, tasks, budgetRow, entries, issuedEntries });
}

function assertExpectedVersion(config, expectedVersion) {
  if (expectedVersion === undefined || expectedVersion === null) return;
  if (Number(expectedVersion) !== Number(config?.version || 0)) {
    throw new RealmOperationError('Reward vừa được người khác cập nhật. Hãy tải lại trước khi thao tác.', 409, 'reward_version_conflict');
  }
}

async function taskForReward(tx, taskId) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    include: { assignee: { select: { id: true, name: true, teamId: true } }, realmQuest: true },
  });
  if (!task) throw new RealmOperationError('Không tìm thấy Task.', 404, 'task_not_found');
  if (!task.assigneeId) throw new RealmOperationError('Task phải được giao cho một nhân sự trước khi cấu hình reward.', 409, 'task_unassigned');
  return task;
}

async function assertRewardNotIssued(tx, taskId) {
  const issued = await tx.realmGoldEntry.findFirst({
    where: { type: 'quest_reward', sourceType: 'task', sourceId: taskId },
    select: { id: true },
  });
  if (issued) throw new RealmOperationError('Reward đã phát hành vào Gold journal nên không thể sửa hoặc duyệt lại.', 409, 'reward_already_issued');
}

async function auditReward(tx, user, task, action, detail) {
  await tx.taskEvent.create({ data: { taskId: task.id, userId: user.id, userName: user.name, text: detail } });
  await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action, entity: 'realm_rewards', refId: task.id, detail } });
}

async function currentRewardObligations(tx, period) {
  const { start, end } = realmRewardPeriodRange(period);
  const [entries, issuedEntries, approvedConfigs] = await Promise.all([
    tx.realmGoldEntry.findMany({
      where: { type: 'quest_reward', createdAt: { gte: start, lt: end } },
      select: { amount: true, userId: true, sourceId: true },
    }),
    tx.realmGoldEntry.findMany({
      where: { type: 'quest_reward', sourceType: 'task' },
      select: { sourceId: true },
    }),
    tx.realmQuestConfig.findMany({
      where: { status: 'approved', active: true },
      select: { gold: true, taskId: true, task: { select: { assigneeId: true } } },
    }),
  ]);
  const issuedSourceIds = new Set(issuedEntries.filter((entry) => entry.sourceId).map((entry) => entry.sourceId));
  const committedRows = approvedConfigs.filter((row) => !issuedSourceIds.has(row.taskId));
  const issued = entries.reduce((sum, entry) => sum + Math.max(0, entry.amount || 0), 0);
  const committed = committedRows.reduce((sum, row) => sum + row.gold, 0);
  const byUser = new Map();
  for (const entry of entries) byUser.set(entry.userId, (byUser.get(entry.userId) || 0) + Math.max(0, entry.amount || 0));
  for (const row of committedRows) {
    const userId = row.task.assigneeId;
    if (userId) byUser.set(userId, (byUser.get(userId) || 0) + row.gold);
  }
  return { issued, committed, used: issued + committed, byUser };
}

async function approveWithinBudget(tx, task, config, now) {
  const period = realmRewardPeriod(now);
  const [budgetRow, obligations] = await Promise.all([
    tx.realmRewardBudget.findUnique({ where: { period } }),
    currentRewardObligations(tx, period),
  ]);
  const policy = effectiveBudget(budgetRow);
  assertRealmRewardBudgetAvailable({
    budget: { ...policy, issued: obligations.issued, committed: obligations.committed },
    proposedGold: config.gold,
    userIssued: obligations.byUser.get(task.assigneeId) || 0,
  });
}

function assertExpectedBudgetVersion(config, expectedVersion) {
  if (expectedVersion === undefined || expectedVersion === null) return;
  if (Number(expectedVersion) !== Number(config?.version || 0)) {
    throw new RealmOperationError('Budget vừa được người khác cập nhật. Hãy tải lại trước khi thao tác.', 409, 'budget_version_conflict');
  }
}

async function auditBudget(tx, user, period, action, detail) {
  await tx.auditLog.create({
    data: { userId: user.id, userName: user.name, action, entity: 'realm_reward_budget', refId: period, detail },
  });
}

async function applyRealmBudgetAction(tx, user, permissions, body, now) {
  const period = realmRewardPeriod(now);
  const action = body?.action;
  const current = await tx.realmRewardBudget.findUnique({ where: { period } });
  assertExpectedBudgetVersion(current, body.version);

  if (action === 'budget-save-draft') {
    requirePermission(permissions.canConfigureBudget, 'Bạn không có quyền cấu hình budget tháng.', 'budget_forbidden');
    if (current?.status === 'approved') throw new RealmOperationError('Budget đã duyệt được khóa cho kỳ này.', 409, 'budget_already_approved');
    const draft = normalizeRealmBudgetDraft(body);
    const budget = await tx.realmRewardBudget.upsert({
      where: { period },
      create: {
        period, ...draft, status: 'draft', configuredById: user.id, configuredAt: now,
      },
      update: {
        ...draft, status: 'draft', configuredById: user.id, configuredAt: now,
        approvedById: null, approvedAt: null, reviewNote: null, version: { increment: 1 },
      },
    });
    await auditBudget(tx, user, period, 'realm_budget_draft', `Budget draft v${budget.version}: ${draft.goldCap} Gold · ${draft.perUserGoldCap} Gold/người`);
    return { type: action, period, version: budget.version };
  }

  if (!current) throw new RealmOperationError('Kỳ này chưa có budget draft.', 409, 'budget_not_configured');

  if (action === 'budget-submit') {
    requirePermission(permissions.canConfigureBudget, 'Bạn không có quyền gửi duyệt budget.', 'budget_forbidden');
    if (!['draft', 'rejected'].includes(current.status)) throw new RealmOperationError('Budget không thể gửi duyệt từ trạng thái hiện tại.', 409, 'invalid_budget_transition');
    const updated = await tx.realmRewardBudget.update({
      where: { id: current.id },
      data: { status: 'pending', approvedById: null, approvedAt: null, reviewNote: null, version: { increment: 1 } },
    });
    await auditBudget(tx, user, period, 'realm_budget_submit', `Gửi duyệt budget v${updated.version}: ${current.goldCap} Gold · ${current.perUserGoldCap} Gold/người`);
    return { type: action, period, version: updated.version };
  }

  requirePermission(permissions.canApproveBudget, 'Bạn không có quyền review budget.', 'budget_forbidden');
  if (current.status !== 'pending') throw new RealmOperationError('Budget không ở trạng thái chờ duyệt.', 409, 'invalid_budget_transition');
  if (current.configuredById === user.id) throw new RealmOperationError('Người cấu hình không được tự review budget.', 409, 'self_approval_forbidden');

  if (action === 'budget-approve') {
    const obligations = await currentRewardObligations(tx, period);
    if (current.goldCap < obligations.used) {
      throw new RealmOperationError('Budget mới thấp hơn Gold đã phát hành và cam kết.', 409, 'budget_below_existing_commitments');
    }
    const overUser = [...obligations.byUser.entries()].find(([, amount]) => amount > current.perUserGoldCap);
    if (overUser) {
      throw new RealmOperationError('Trần nhân sự thấp hơn Gold đã phát hành hoặc cam kết cho một thành viên.', 409, 'budget_below_user_commitments');
    }
    const reviewNote = normalizeRealmRewardReviewNote(body.reviewNote);
    const updated = await tx.realmRewardBudget.update({
      where: { id: current.id },
      data: { status: 'approved', approvedById: user.id, approvedAt: now, reviewNote: reviewNote || null, version: { increment: 1 } },
    });
    await auditBudget(tx, user, period, 'realm_budget_approve', `Phê duyệt budget v${updated.version}: ${current.goldCap} Gold · ${current.perUserGoldCap} Gold/người`);
    return { type: action, period, version: updated.version };
  }

  if (action === 'budget-reject') {
    const reviewNote = normalizeRealmRewardReviewNote(body.reviewNote, { required: true });
    const updated = await tx.realmRewardBudget.update({
      where: { id: current.id },
      data: { status: 'rejected', approvedById: user.id, approvedAt: null, reviewNote, version: { increment: 1 } },
    });
    await auditBudget(tx, user, period, 'realm_budget_reject', `Yêu cầu chỉnh budget v${updated.version}: ${reviewNote}`);
    return { type: action, period, version: updated.version };
  }

  throw new RealmOperationError('Action budget không được hỗ trợ.', 400, 'unsupported_budget_action');
}

export async function applyRealmRewardAdminAction(db, user, body, now = new Date()) {
  const permissions = realmRewardPermissions(user);
  requirePermission(permissions.canView, 'Bạn không có quyền quản trị reward.');
  const action = body?.action;
  if (String(action || '').startsWith('budget-')) {
    return db.$transaction(
      (tx) => applyRealmBudgetAction(tx, user, permissions, body, now),
      { isolationLevel: 'Serializable' },
    );
  }
  const taskId = String(body?.taskId || '').trim();
  if (!taskId || taskId.length > 100) throw new RealmOperationError('Task ID không hợp lệ.', 400, 'invalid_task_id');

  return db.$transaction(async (tx) => {
    const task = await taskForReward(tx, taskId);
    await assertRewardNotIssued(tx, taskId);

    if (action === 'save-draft') {
      requirePermission(permissions.canConfigure && canConfigureTask(user, task), 'Bạn không có quyền cấu hình reward cho Task này.');
      const draft = normalizeRealmRewardDraft(body);
      assertExpectedVersion(task.realmQuest, body.version);
      const config = await tx.realmQuestConfig.upsert({
        where: { taskId },
        create: {
          taskId, ...draft, active: true, status: 'draft', configuredById: user.id, configuredAt: now,
        },
        update: {
          ...draft, active: true, status: 'draft', configuredById: user.id, configuredAt: now,
          approvedById: null, approvedAt: null, reviewNote: null, version: { increment: 1 },
        },
      });
      await auditReward(tx, user, task, 'realm_reward_draft', `Reward draft v${config.version}: ${draft.gold} Gold · ${draft.renown} Renown`);
      return { type: action, taskId, version: config.version };
    }

    const config = task.realmQuest;
    if (!config) throw new RealmOperationError('Task chưa có reward draft.', 409, 'reward_not_configured');
    assertExpectedVersion(config, body.version);

    if (action === 'submit') {
      requirePermission(permissions.canConfigure && canConfigureTask(user, task), 'Bạn không có quyền gửi duyệt reward cho Task này.');
      if (!['draft', 'rejected'].includes(rewardStatus(config))) throw new RealmOperationError('Reward không thể chuyển sang chờ duyệt từ trạng thái hiện tại.', 409, 'invalid_reward_transition');
      const updated = await tx.realmQuestConfig.update({
        where: { id: config.id },
        data: { status: 'pending', approvedById: null, approvedAt: null, reviewNote: null, version: { increment: 1 } },
      });
      await auditReward(tx, user, task, 'realm_reward_submit', `Gửi duyệt reward v${updated.version}: ${config.gold} Gold · ${config.renown} Renown`);
      return { type: action, taskId, version: updated.version };
    }

    requirePermission(permissions.canApprove, 'Bạn không có quyền phê duyệt reward.');
    if (rewardStatus(config) !== 'pending') throw new RealmOperationError('Reward không ở trạng thái chờ duyệt.', 409, 'invalid_reward_transition');
    if (config.configuredById === user.id) throw new RealmOperationError('Người cấu hình không được tự duyệt reward.', 409, 'self_approval_forbidden');

    if (action === 'approve') {
      await approveWithinBudget(tx, task, config, now);
      const reviewNote = normalizeRealmRewardReviewNote(body.reviewNote);
      const updated = await tx.realmQuestConfig.update({
        where: { id: config.id },
        data: { status: 'approved', approvedById: user.id, approvedAt: now, reviewNote: reviewNote || null, version: { increment: 1 } },
      });
      await auditReward(tx, user, task, 'realm_reward_approve', `Phê duyệt reward v${updated.version}: ${config.gold} Gold · ${config.renown} Renown`);
      return { type: action, taskId, version: updated.version };
    }

    if (action === 'reject') {
      const reviewNote = normalizeRealmRewardReviewNote(body.reviewNote, { required: true });
      const updated = await tx.realmQuestConfig.update({
        where: { id: config.id },
        data: { status: 'rejected', approvedById: user.id, approvedAt: null, reviewNote, version: { increment: 1 } },
      });
      await auditReward(tx, user, task, 'realm_reward_reject', `Yêu cầu chỉnh reward v${updated.version}: ${reviewNote}`);
      return { type: action, taskId, version: updated.version };
    }

    throw new RealmOperationError('Action reward không được hỗ trợ.', 400, 'unsupported_reward_action');
  }, { isolationLevel: 'Serializable' });
}
