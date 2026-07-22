import { buildCrmWorkloadIntelligence } from './crm-workload-intelligence.js';
import { isDirector, isFreelancer, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-operation.js';

function fail(message, status, code) {
  throw new RealmOperationError(message, status, code);
}

export function crmWorkloadScope(user) {
  if (!user?.id) return { kind: 'none', code: 'unauthorized' };
  if (isFreelancer(user)) return { kind: 'none', code: 'crm_workload_freelancer_forbidden' };
  if (isDirector(user)) return { kind: 'company' };
  if (rolesOf(user).includes('AM')) return { kind: 'portfolio', userId: user.id };
  return { kind: 'none', code: 'crm_workload_scope_missing' };
}

function parseSettings(row) {
  let settings = {};
  try { settings = JSON.parse(row?.json || '{}'); } catch { settings = {}; }
  return {
    staleDays: settings.crmStaleDays,
    dormantDays: settings.crmDormantDays,
    newResponseDays: settings.crmNewResponseDays,
    ownerWipLimit: settings.crmLeadWipLimit,
    stageProbability: {
      new: settings.probNew,
      contacted: settings.probContacted,
      proposal: settings.probProposal,
      negotiation: settings.probNegotiation,
      won: 100,
      lost: 0,
    },
  };
}

export async function loadCrmWorkloadIntelligence(db, user, now = new Date()) {
  const scope = crmWorkloadScope(user);
  if (scope.code === 'unauthorized') fail('Bạn cần đăng nhập ERP.', 401, scope.code);
  if (scope.kind === 'none') fail(
    scope.code === 'crm_workload_freelancer_forbidden'
      ? 'Freelancer không sử dụng CRM Workload Intelligence nội bộ.'
      : 'CRM Workload Intelligence chỉ dành cho Account/Sales và Director.',
    403,
    scope.code,
  );

  const leads = await db.lead.findMany({
    where: scope.kind === 'company' ? {} : { OR: [{ ownerId: scope.userId }, { ownerId: null }] },
    select: {
      id: true, name: true, company: true, email: true, phone: true, source: true,
      value: true, stage: true, ownerId: true, createdAt: true, expectedClose: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });
  const leadIds = leads.map((lead) => lead.id);
  const [activities, userRows, setting] = await Promise.all([
    leadIds.length ? db.activity.findMany({
      where: { refType: 'lead', refId: { in: leadIds } },
      select: { id: true, refId: true, kind: true, title: true, date: true, done: true, userId: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 20_000,
    }) : [],
    db.user.findMany({
      where: { status: 'active', userType: 'employee' },
      select: { id: true, name: true, title: true, role: true, roles: true },
      take: 1000,
    }),
    db.setting.findUnique({ where: { id: 1 }, select: { json: true } }),
  ]);
  const salesOwners = userRows.filter((row) => rolesOf(row).includes('AM') || isDirector(row));
  const visibleOwners = scope.kind === 'company'
    ? salesOwners
    : salesOwners.filter((row) => row.id === scope.userId || leads.some((lead) => lead.ownerId === row.id));
  const intelligence = buildCrmWorkloadIntelligence({
    leads,
    activities,
    owners: visibleOwners,
    now,
    policy: parseSettings(setting),
  });

  return Object.freeze({
    source: 'canonical-erp-crm',
    generatedAt: now.toISOString(),
    scope: Object.freeze({ kind: scope.kind, userId: scope.userId || null }),
    workloadIntelligence: intelligence,
    limits: Object.freeze({
      leadSnapshot: 2000,
      activitySnapshot: 20_000,
      leadSnapshotTruncated: leads.length >= 2000,
      activitySnapshotTruncated: activities.length >= 20_000,
    }),
  });
}
