import { hasAny, isDirector } from './perm.js';
import { RealmOperationError } from './realm-erp-adapter.js';
import { createRealmEmbassyDashboard } from './realm-embassy.js';
import { canWrite } from './registry.js';

export function realmEmbassyScope(user) {
  if (!user?.id) return { kind: 'none' };
  if (isDirector(user)) return { kind: 'company' };
  if (hasAny(user, ['AM'])) return { kind: 'portfolio', userId: user.id };
  return { kind: 'none' };
}

export async function loadRealmEmbassyDashboard(db, user, now = new Date()) {
  const scope = realmEmbassyScope(user);
  if (scope.kind === 'none') {
    throw new RealmOperationError('Royal Embassy chỉ dành cho Account/Sales và Director.', 403, 'embassy_scope_missing');
  }
  const leads = await db.lead.findMany({
    where: scope.kind === 'company' ? {} : { OR: [{ ownerId: scope.userId }, { ownerId: null }] },
    select: { id: true, name: true, company: true, source: true, value: true, stage: true, ownerId: true, createdAt: true, expectedClose: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const ownerIds = [...new Set(leads.map((lead) => lead.ownerId).filter(Boolean))];
  const [ownerRows, clients] = await Promise.all([
    ownerIds.length ? db.user.findMany({
      where: { id: { in: ownerIds }, status: 'active' },
      select: { id: true, name: true },
      take: 100,
    }) : [],
    db.client.findMany({
      select: {
        id: true,
        name: true,
        industry: true,
        projects: { select: { id: true, name: true, status: true, progress: true, deadline: true } },
      },
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ]);
  const followupWriteAllowed = canWrite('activities', user);
  return createRealmEmbassyDashboard({
    source: 'erp',
    leads: leads.map((lead) => ({ ...lead, canTransition: canWrite('leads', user), canFollowUp: followupWriteAllowed })),
    clients,
    owners: new Map(ownerRows.map((owner) => [owner.id, owner])),
    now,
    generatedAt: now.toISOString(),
    permissions: { scope: scope.kind, canTransition: canWrite('leads', user), canFollowUp: followupWriteAllowed },
  });
}
