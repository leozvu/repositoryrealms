import { hasAny, rolesOf } from './perm.js';

export async function resolveManagerScope(db, user) {
  if (!user?.id) return { kind: 'none', teamIds: [] };
  if (hasAny(user, ['PM'])) return { kind: 'company', teamIds: [] };
  if (!rolesOf(user).includes('LEAD')) return { kind: 'none', teamIds: [] };

  const teamIds = new Set(user.teamId ? [user.teamId] : []);
  if (typeof db?.team?.findMany === 'function') {
    const managed = await db.team.findMany({
      where: { leadId: user.id },
      select: { id: true },
      take: 100,
    });
    for (const team of managed) if (team?.id) teamIds.add(team.id);
  }
  return { kind: teamIds.size ? 'teams' : 'none', teamIds: [...teamIds] };
}

export function managerTargetInScope(scope, target, user) {
  if (!target?.id) return false;
  if (target.id === user?.id) return true;
  if (scope?.kind === 'company') return true;
  return scope?.kind === 'teams' && Boolean(target.teamId) && scope.teamIds.includes(target.teamId);
}

export function managerTaskInScope(scope, task, user, { allowUnassigned = false } = {}) {
  if (!task) return false;
  if (task.assigneeId === user?.id) return true;
  if (scope?.kind === 'company') return true;
  if (!task.assigneeId) return allowUnassigned && scope?.kind === 'teams';
  return scope?.kind === 'teams' && Boolean(task.assignee?.teamId) && scope.teamIds.includes(task.assignee.teamId);
}
