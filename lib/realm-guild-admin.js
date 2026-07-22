import { RealmOperationError } from './realm-erp-adapter.js';
import { serializeRealmGuildDashboard } from './realm-guild.js';
import { isDirector, rolesOf } from './perm.js';

export function realmGuildScope(user) {
  if (!user?.id) return { kind: 'none' };
  const roles = rolesOf(user);
  if (isDirector(user) || roles.some((role) => ['PM', 'HR'].includes(role))) return { kind: 'company' };
  if (user.teamId) return { kind: 'team', teamId: user.teamId };
  return { kind: 'self', userId: user.id };
}

export async function loadRealmGuildDashboard(db, user, now = new Date()) {
  const scope = realmGuildScope(user);
  if (scope.kind === 'none') throw new RealmOperationError('Không xác định được phạm vi Guild.', 403, 'guild_scope_missing');

  const team = scope.kind === 'team'
    ? await db.team.findUnique({ where: { id: scope.teamId }, select: { id: true, name: true, leadId: true } })
    : null;
  const members = await db.user.findMany({
    where: scope.kind === 'company'
      ? { status: 'active', userType: 'employee' }
      : scope.kind === 'team'
        ? { teamId: scope.teamId, status: 'active', userType: 'employee' }
        : { id: scope.userId, status: 'active', userType: 'employee' },
    select: {
      id: true,
      name: true,
      title: true,
      realmProfile: { select: { realmClass: true, color: true } },
    },
    orderBy: { name: 'asc' },
    take: 100,
  });
  const memberIds = members.map((member) => member.id);
  const tasks = memberIds.length ? await db.task.findMany({
    where: { assigneeId: { in: memberIds } },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      assigneeId: true,
      project: { select: { id: true, name: true, status: true, progress: true } },
      realmQuest: { select: { active: true, approvedAt: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: 500,
  }) : [];
  const taskIds = tasks.map((task) => task.id);
  const rewardEntries = taskIds.length ? await db.realmGoldEntry.findMany({
    where: { type: 'quest_reward', sourceType: 'task', sourceId: { in: taskIds } },
    select: { sourceId: true },
    take: 500,
  }) : [];
  return serializeRealmGuildDashboard({
    team: team || (scope.kind === 'company'
      ? { id: 'company-guild', name: 'Company Adventurers Guild', leadId: isDirector(user) ? user.id : null }
      : scope.kind === 'team'
        ? { id: scope.teamId, name: 'Guild chưa đặt tên', leadId: null }
        : null),
    members,
    tasks,
    rewardedSourceIds: new Set(rewardEntries.map((entry) => entry.sourceId).filter(Boolean)),
    now,
    scope: scope.kind,
  });
}
