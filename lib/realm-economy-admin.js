import { isDirector, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-erp-adapter.js';
import { createRealmEconomySnapshot } from './realm-economy.js';
import { REALM_REWARD_LIMITS, realmRewardPeriod, realmRewardPeriodRange, realmRewardPermissions } from './realm-rewards.js';

function requireEconomyPermission(condition, message, code = 'economy_forbidden') {
  if (!condition) throw new RealmOperationError(message, 403, code);
}

export function realmEconomyScope(user) {
  const roles = rolesOf(user);
  if (isDirector(user) || roles.some((role) => ['PM', 'HR'].includes(role))) return 'company';
  if (roles.includes('LEAD') && user?.teamId) return 'team';
  return 'none';
}

function effectiveBudget(row) {
  const approved = row?.status === 'approved' && row?.approvedAt;
  return {
    cap: approved ? row.goldCap : REALM_REWARD_LIMITS.defaultMonthlyGoldCap,
    perUserCap: approved ? row.perUserGoldCap : REALM_REWARD_LIMITS.defaultPerUserGoldCap,
    policyStatus: approved ? 'approved' : 'default-policy',
  };
}

export async function loadRealmEconomyDashboard(db, user, now = new Date()) {
  const rewardPermissions = realmRewardPermissions(user);
  const scope = realmEconomyScope(user);
  requireEconomyPermission(rewardPermissions.canView && scope !== 'none', 'Bạn không có quyền xem Gold Economy Observatory.');
  const period = realmRewardPeriod(now);
  const { start, end } = realmRewardPeriodRange(period);
  const teamScoped = scope === 'team';
  const entryWhere = {
    createdAt: { gte: start, lt: end },
    ...(teamScoped ? { user: { teamId: user.teamId } } : {}),
  };
  const questWhere = {
    active: true,
    status: { in: ['approved', 'pending'] },
    ...(teamScoped ? { task: { assignee: { teamId: user.teamId } } } : {}),
  };
  const issuedWhere = {
    type: 'quest_reward',
    sourceType: 'task',
    ...(teamScoped ? { user: { teamId: user.teamId } } : {}),
  };
  const [entries, rewardConfigs, issuedEntries, budgetRow] = await Promise.all([
    db.realmGoldEntry.findMany({
      where: entryWhere,
      select: {
        id: true,
        userId: true,
        type: true,
        amount: true,
        renown: true,
        label: true,
        sourceType: true,
        sourceId: true,
        createdAt: true,
        user: { select: { id: true, name: true, teamId: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    db.realmQuestConfig.findMany({
      where: questWhere,
      select: {
        id: true,
        taskId: true,
        gold: true,
        status: true,
        task: {
          select: {
            title: true,
            assigneeId: true,
            assignee: { select: { id: true, name: true, teamId: true, title: true } },
          },
        },
      },
      take: 300,
    }),
    db.realmGoldEntry.findMany({ where: issuedWhere, select: { sourceId: true } }),
    db.realmRewardBudget.findUnique({ where: { period } }),
  ]);
  const issuedSourceIds = new Set(issuedEntries.filter((entry) => entry.sourceId).map((entry) => entry.sourceId));
  const teamLabel = (teamId) => teamId ? `Team ${teamId}` : 'Chưa phân đội';
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    userName: entry.user?.name,
    teamId: entry.user?.teamId,
    teamName: teamLabel(entry.user?.teamId),
    title: entry.user?.title,
  }));
  const rewardRows = rewardConfigs.map((config) => ({
    id: config.id,
    taskId: config.taskId,
    title: config.task.title,
    assigneeId: config.task.assigneeId,
    assignee: config.task.assignee?.name,
    teamId: config.task.assignee?.teamId,
    teamName: teamLabel(config.task.assignee?.teamId),
    gold: config.gold,
    status: config.status,
    rewardIssued: issuedSourceIds.has(config.taskId),
  }));
  return createRealmEconomySnapshot({
    entries: normalizedEntries,
    rewardRows,
    budget: effectiveBudget(budgetRow),
    now,
    source: 'erp',
    actor: { id: user.id, name: user.name, roleLabel: rolesOf(user).join(' + ') },
    permissions: { canView: true, scope, teamId: teamScoped ? user.teamId : null },
  });
}
