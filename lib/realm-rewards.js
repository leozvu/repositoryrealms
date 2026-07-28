import { hasAny, isDirector, rolesOf } from './perm.js';

export const REALM_REWARD_LIMITS = Object.freeze({
  maxGoldPerQuest: 20,
  maxRenownPerQuest: 500,
  defaultMonthlyGoldCap: 140,
  defaultPerUserGoldCap: 45,
  maxMonthlyGoldCap: 10000,
  maxPerUserGoldCap: 1000,
});

export const REALM_REWARD_STATUSES = new Set(['draft', 'pending', 'approved', 'rejected']);

export class RealmRewardPolicyError extends Error {
  constructor(message, status = 400, code = 'realm_reward_policy_error') {
    super(message);
    this.name = 'RealmRewardPolicyError';
    this.status = status;
    this.code = code;
  }
}

const integer = (value) => Number.isInteger(Number(value)) ? Number(value) : NaN;

export function realmRewardPeriod(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new RealmRewardPolicyError('Kỳ reward không hợp lệ.', 400, 'invalid_reward_period');
  return value.toISOString().slice(0, 7);
}

export function realmRewardPeriodRange(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) {
    throw new RealmRewardPolicyError('Kỳ reward phải theo định dạng YYYY-MM.', 400, 'invalid_reward_period');
  }
  const [year, month] = period.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export function realmRewardPermissions(user) {
  const canManageBudget = isDirector(user);
  return {
    canView: hasAny(user, ['PM', 'LEAD', 'HR']),
    canConfigure: hasAny(user, ['PM', 'LEAD']),
    canApprove: hasAny(user, ['HR']),
    canManageBudget,
    canConfigureBudget: canManageBudget,
    canApproveBudget: canManageBudget,
    roles: rolesOf(user),
  };
}

export function normalizeRealmRewardDraft(input) {
  const gold = integer(input?.gold);
  const renown = integer(input?.renown);
  const note = String(input?.note || '').trim();
  if (!Number.isInteger(gold) || gold < 1 || gold > REALM_REWARD_LIMITS.maxGoldPerQuest) {
    throw new RealmRewardPolicyError(`Gold mỗi Quest phải từ 1 đến ${REALM_REWARD_LIMITS.maxGoldPerQuest}.`, 400, 'invalid_reward_gold');
  }
  if (!Number.isInteger(renown) || renown < 0 || renown > REALM_REWARD_LIMITS.maxRenownPerQuest) {
    throw new RealmRewardPolicyError(`Renown mỗi Quest phải từ 0 đến ${REALM_REWARD_LIMITS.maxRenownPerQuest}.`, 400, 'invalid_reward_renown');
  }
  if (note.length < 8 || note.length > 500) {
    throw new RealmRewardPolicyError('Lý do reward phải từ 8 đến 500 ký tự.', 400, 'invalid_reward_note');
  }
  return { gold, renown, note };
}

export function normalizeRealmRewardReviewNote(value, { required = false } = {}) {
  const note = String(value || '').trim();
  if (required && note.length < 8) throw new RealmRewardPolicyError('Lý do yêu cầu chỉnh sửa phải có ít nhất 8 ký tự.', 400, 'review_note_required');
  if (note.length > 500) throw new RealmRewardPolicyError('Nhận xét duyệt không được vượt quá 500 ký tự.', 400, 'review_note_too_long');
  return note;
}

export function normalizeRealmBudgetDraft(input) {
  const goldCap = integer(input?.goldCap);
  const perUserGoldCap = integer(input?.perUserGoldCap);
  const note = String(input?.note || '').trim();
  if (!Number.isInteger(goldCap) || goldCap < 1 || goldCap > REALM_REWARD_LIMITS.maxMonthlyGoldCap) {
    throw new RealmRewardPolicyError(`Trần tháng phải từ 1 đến ${REALM_REWARD_LIMITS.maxMonthlyGoldCap} Gold.`, 400, 'invalid_budget_gold_cap');
  }
  if (!Number.isInteger(perUserGoldCap) || perUserGoldCap < 1 || perUserGoldCap > REALM_REWARD_LIMITS.maxPerUserGoldCap) {
    throw new RealmRewardPolicyError(`Trần mỗi nhân sự phải từ 1 đến ${REALM_REWARD_LIMITS.maxPerUserGoldCap} Gold.`, 400, 'invalid_budget_user_cap');
  }
  if (perUserGoldCap > goldCap) {
    throw new RealmRewardPolicyError('Trần mỗi nhân sự không thể lớn hơn trần Gold toàn công ty.', 400, 'invalid_budget_cap_ratio');
  }
  if (note.length < 8 || note.length > 500) {
    throw new RealmRewardPolicyError('Lý do cấu hình budget phải từ 8 đến 500 ký tự.', 400, 'invalid_budget_note');
  }
  return { goldCap, perUserGoldCap, note };
}

export function calculateRealmRewardBudget({
  cap = REALM_REWARD_LIMITS.defaultMonthlyGoldCap,
  perUserCap = REALM_REWARD_LIMITS.defaultPerUserGoldCap,
  issued = 0,
  committed = 0,
  pending = 0,
} = {}) {
  const safeCap = Math.max(1, integer(cap) || REALM_REWARD_LIMITS.defaultMonthlyGoldCap);
  const safeUserCap = Math.max(1, integer(perUserCap) || REALM_REWARD_LIMITS.defaultPerUserGoldCap);
  const safeIssued = Math.max(0, integer(issued) || 0);
  const safeCommitted = Math.max(0, integer(committed) || 0);
  const safePending = Math.max(0, integer(pending) || 0);
  const used = safeIssued + safeCommitted;
  return {
    cap: safeCap,
    perUserCap: safeUserCap,
    issued: safeIssued,
    committed: safeCommitted,
    pending: safePending,
    used,
    remaining: Math.max(0, safeCap - used),
    utilization: Math.min(100, Math.round((used / safeCap) * 100)),
    overCap: used > safeCap,
  };
}

export function assertRealmRewardBudgetAvailable({ budget, proposedGold, userIssued = 0, userCommitted = 0 }) {
  const proposed = integer(proposedGold);
  if (!Number.isInteger(proposed) || proposed <= 0) {
    throw new RealmRewardPolicyError('Gold đề xuất không hợp lệ.', 400, 'invalid_reward_gold');
  }
  const summary = calculateRealmRewardBudget(budget);
  if (proposed > summary.remaining) {
    throw new RealmRewardPolicyError('Phê duyệt này vượt hạn mức Gold còn lại của tháng.', 409, 'monthly_gold_cap_exceeded');
  }
  if (Math.max(0, userIssued) + Math.max(0, userCommitted) + proposed > summary.perUserCap) {
    throw new RealmRewardPolicyError('Phê duyệt này vượt hạn mức Gold tháng của nhân sự.', 409, 'user_gold_cap_exceeded');
  }
  return summary;
}

function demoStatus(index) {
  return ['approved', 'pending', 'draft'][index % 3];
}

export function createRealmRewardDemoDashboard(quests = []) {
  const rows = quests.map((quest, index) => {
    const status = demoStatus(index);
    return {
      id: `reward:${quest.businessRef || quest.id}`,
      taskId: quest.businessRef || quest.id,
      title: quest.title,
      project: quest.project,
      assignee: quest.owner || ['Mai Anh', 'Quang Võ', 'Nghĩa Nguyễn'][index % 3],
      gold: Math.max(1, Number(quest.reward) || 1),
      renown: Math.max(0, Number(quest.renown) || 0),
      note: index === 0 ? 'Hoàn tất toàn bộ tiêu chí và bàn giao đúng hạn.' : 'Reward theo độ khó và tác động của công việc.',
      status,
      configuredBy: index === 0 ? 'Minh Quân' : 'Quang Võ',
      configuredById: index === 0 ? 'manager-1' : 'manager-2',
      approvedBy: status === 'approved' ? 'Lan Phạm' : null,
      reviewNote: status === 'rejected' ? 'Cần mô tả rõ tiêu chí nghiệm thu.' : '',
      rewardIssued: quest.status === 'claimed',
      version: 1,
    };
  });
  return recalculateRealmRewardDemoDashboard({
    source: 'local',
    period: realmRewardPeriod(),
    permissions: {
      canView: true,
      canConfigure: true,
      canApprove: true,
      canManageBudget: true,
      canConfigureBudget: true,
      canApproveBudget: true,
      demo: true,
    },
    actor: { id: 'demo-reviewer', name: 'Hội đồng HR', roleLabel: 'HR checker · sandbox' },
    budget: {
      cap: 140,
      perUserCap: 45,
      issued: 20,
      policyStatus: 'default-policy',
      configuration: {
        id: 'budget:demo-current',
        period: realmRewardPeriod(),
        goldCap: 160,
        perUserGoldCap: 50,
        note: 'Mở rộng hạn mức cho chiến dịch ra mắt quý này.',
        status: 'pending',
        configuredBy: 'Minh Quân',
        configuredById: 'director-maker',
        approvedBy: null,
        reviewNote: '',
        version: 1,
      },
    },
    rows,
  });
}

export function recalculateRealmRewardDemoDashboard(dashboard) {
  const rows = Array.isArray(dashboard?.rows) ? dashboard.rows : [];
  const committed = rows.filter((row) => row.status === 'approved' && !row.rewardIssued).reduce((sum, row) => sum + row.gold, 0);
  const pending = rows.filter((row) => row.status === 'pending').reduce((sum, row) => sum + row.gold, 0);
  const configuration = dashboard?.budget?.configuration || null;
  const approvedConfiguration = configuration?.status === 'approved';
  const cap = approvedConfiguration ? configuration.goldCap : dashboard?.budget?.cap;
  const perUserCap = approvedConfiguration ? configuration.perUserGoldCap : dashboard?.budget?.perUserCap;
  return {
    ...dashboard,
    rows,
    budget: {
      ...calculateRealmRewardBudget({ ...dashboard.budget, cap, perUserCap, committed, pending }),
      policyStatus: approvedConfiguration ? 'approved' : (dashboard?.budget?.policyStatus || 'default-policy'),
      configuration,
      configuredCap: configuration ? {
        goldCap: configuration.goldCap,
        perUserGoldCap: configuration.perUserGoldCap,
        status: configuration.status,
      } : null,
    },
  };
}

function assertDemoVersion(current, expectedVersion, entity = 'Reward') {
  if (expectedVersion === undefined || expectedVersion === null) return;
  if (Number(expectedVersion) !== Number(current?.version || 0)) {
    throw new RealmRewardPolicyError(`${entity} vừa được người khác cập nhật. Hãy tải lại trước khi thao tác.`, 409, 'reward_version_conflict');
  }
}

function applyRealmBudgetDemoAction(dashboard, action) {
  const current = dashboard.budget.configuration || null;
  const canConfigure = dashboard.permissions?.canConfigureBudget ?? dashboard.permissions?.canManageBudget;
  const canApprove = dashboard.permissions?.canApproveBudget ?? dashboard.permissions?.canManageBudget;
  assertDemoVersion(current, action.version, 'Budget');
  let configuration;

  if (action.type === 'budget-save-draft') {
    if (!canConfigure) throw new RealmRewardPolicyError('Bạn không có quyền cấu hình budget.', 403, 'budget_forbidden');
    if (current?.status === 'approved') throw new RealmRewardPolicyError('Budget đã duyệt được khóa cho kỳ này.', 409, 'budget_already_approved');
    const draft = normalizeRealmBudgetDraft(action);
    configuration = {
      ...current,
      id: current?.id || `budget:${dashboard.period}`,
      period: dashboard.period,
      ...draft,
      status: 'draft',
      configuredBy: dashboard.actor.name,
      configuredById: dashboard.actor.id,
      approvedBy: null,
      reviewNote: '',
      version: (current?.version || 0) + 1,
    };
  } else if (action.type === 'budget-submit') {
    if (!canConfigure) throw new RealmRewardPolicyError('Bạn không có quyền gửi duyệt budget.', 403, 'budget_forbidden');
    if (!current || !['draft', 'rejected'].includes(current.status)) throw new RealmRewardPolicyError('Budget không thể gửi duyệt từ trạng thái hiện tại.', 409, 'invalid_budget_transition');
    configuration = { ...current, status: 'pending', approvedBy: null, reviewNote: '', version: current.version + 1 };
  } else if (action.type === 'budget-approve') {
    if (!canApprove) throw new RealmRewardPolicyError('Bạn không có quyền phê duyệt budget.', 403, 'budget_forbidden');
    if (!current || current.status !== 'pending') throw new RealmRewardPolicyError('Budget không ở trạng thái chờ duyệt.', 409, 'invalid_budget_transition');
    if (current.configuredById === dashboard.actor.id) throw new RealmRewardPolicyError('Người cấu hình không được tự duyệt budget.', 409, 'self_approval_forbidden');
    if (current.goldCap < dashboard.budget.used) throw new RealmRewardPolicyError('Budget mới thấp hơn Gold đã phát hành và cam kết.', 409, 'budget_below_existing_commitments');
    const maxUserCommitment = Math.max(0, ...dashboard.rows.map((row) => dashboard.rows
      .filter((candidate) => candidate.assignee === row.assignee && candidate.status === 'approved' && !candidate.rewardIssued)
      .reduce((sum, candidate) => sum + candidate.gold, 0)));
    if (current.perUserGoldCap < maxUserCommitment) throw new RealmRewardPolicyError('Trần nhân sự thấp hơn Gold đã cam kết cho một thành viên.', 409, 'budget_below_user_commitments');
    configuration = {
      ...current,
      status: 'approved',
      approvedBy: dashboard.actor.name,
      approvedById: dashboard.actor.id,
      reviewNote: normalizeRealmRewardReviewNote(action.reviewNote),
      version: current.version + 1,
    };
  } else if (action.type === 'budget-reject') {
    if (!canApprove) throw new RealmRewardPolicyError('Bạn không có quyền trả lại budget.', 403, 'budget_forbidden');
    if (!current || current.status !== 'pending') throw new RealmRewardPolicyError('Budget không ở trạng thái chờ duyệt.', 409, 'invalid_budget_transition');
    if (current.configuredById === dashboard.actor.id) throw new RealmRewardPolicyError('Người cấu hình không được tự review budget.', 409, 'self_approval_forbidden');
    configuration = {
      ...current,
      status: 'rejected',
      approvedBy: dashboard.actor.name,
      approvedById: dashboard.actor.id,
      reviewNote: normalizeRealmRewardReviewNote(action.reviewNote, { required: true }),
      version: current.version + 1,
    };
  } else {
    throw new RealmRewardPolicyError('Action budget không được hỗ trợ.', 400, 'unsupported_budget_action');
  }

  return recalculateRealmRewardDemoDashboard({
    ...dashboard,
    budget: { ...dashboard.budget, configuration },
  });
}

export function applyRealmRewardDemoAction(dashboard, action) {
  if (String(action?.type || '').startsWith('budget-')) return applyRealmBudgetDemoAction(dashboard, action);
  const taskId = String(action?.taskId || '');
  const current = dashboard.rows.find((row) => row.taskId === taskId);
  if (!current) throw new RealmRewardPolicyError('Không tìm thấy Task reward.', 404, 'reward_not_found');
  assertDemoVersion(current, action.version);
  let nextRow;
  if (action.type === 'save-draft') {
    const draft = normalizeRealmRewardDraft(action);
    if (current.rewardIssued) throw new RealmRewardPolicyError('Reward đã phát hành không thể cấu hình lại.', 409, 'reward_already_issued');
    nextRow = { ...current, ...draft, status: 'draft', configuredBy: 'Minh Quân', configuredById: 'demo-configurator', approvedBy: null, reviewNote: '', version: current.version + 1 };
  } else if (action.type === 'submit') {
    if (!['draft', 'rejected'].includes(current.status)) throw new RealmRewardPolicyError('Chỉ draft hoặc reward bị trả lại mới có thể gửi duyệt.', 409, 'invalid_reward_transition');
    nextRow = { ...current, status: 'pending', reviewNote: '', version: current.version + 1 };
  } else if (action.type === 'approve') {
    if (current.status !== 'pending') throw new RealmRewardPolicyError('Reward không ở trạng thái chờ duyệt.', 409, 'invalid_reward_transition');
    if (current.configuredById === dashboard.actor.id) throw new RealmRewardPolicyError('Người cấu hình không được tự duyệt reward.', 409, 'self_approval_forbidden');
    const userCommitted = dashboard.rows
      .filter((row) => row.assignee === current.assignee && row.status === 'approved' && !row.rewardIssued)
      .reduce((sum, row) => sum + row.gold, 0);
    assertRealmRewardBudgetAvailable({ budget: dashboard.budget, proposedGold: current.gold, userCommitted });
    nextRow = { ...current, status: 'approved', approvedBy: dashboard.actor.name, reviewNote: normalizeRealmRewardReviewNote(action.reviewNote), version: current.version + 1 };
  } else if (action.type === 'reject') {
    if (current.status !== 'pending') throw new RealmRewardPolicyError('Reward không ở trạng thái chờ duyệt.', 409, 'invalid_reward_transition');
    nextRow = { ...current, status: 'rejected', approvedBy: dashboard.actor.name, reviewNote: normalizeRealmRewardReviewNote(action.reviewNote, { required: true }), version: current.version + 1 };
  } else {
    throw new RealmRewardPolicyError('Action reward không được hỗ trợ.', 400, 'unsupported_reward_action');
  }
  return recalculateRealmRewardDemoDashboard({
    ...dashboard,
    rows: dashboard.rows.map((row) => row.taskId === taskId ? nextRow : row),
  });
}
