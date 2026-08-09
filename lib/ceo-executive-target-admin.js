import { prisma } from './prisma.js';
import { buildCeoCapabilityModel, parseCeoSettings, resolveCeoEntityIdentity } from './ceo-entity-contract.js';
import { buildCeoExecutiveSnapshot } from './ceo-executive-contract.js';

function entityIdentity(settings) {
  return resolveCeoEntityIdentity({
    settings,
    explicitEntityId: process.env.CEO_ENTITY_ID,
    runtimeUrl: process.env.NEXTAUTH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL,
    databaseUrl: process.env.DATABASE_URL,
  });
}

export async function loadLocalCeoExecutiveSnapshot(db = prisma, now = new Date()) {
  const settingRow = await db.setting.findUnique({ where: { id: 1 } });
  const settings = parseCeoSettings(settingRow);
  const identity = entityIdentity(settings);
  const capabilityModel = buildCeoCapabilityModel({ identity, settings });
  const enabled = capabilityModel.domains;
  const [approvals, tasks, workQueueStates, incidents, leads, transactions, invoices, activeHeadcount, liveSessions] = await Promise.all([
    db.approval.findMany({ where: { status: 'pending' }, select: { type: true, status: true, createdAt: true }, take: 2_000 }),
    db.task.findMany({ where: { status: { in: ['todo', 'doing', 'blocked', 'waiting'] } }, select: { status: true, assigneeId: true }, take: 10_000 }),
    db.workQueueState.findMany({ select: { ownerId: true, wipLimit: true }, take: 2_000 }),
    enabled.support ? db.ticket.findMany({
      where: { source: 'incident_registry', status: { in: ['open', 'in_progress'] } },
      select: { id: true, code: true, priority: true, status: true, updatedAt: true, dueAt: true },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }], take: 20,
    }) : [],
    enabled.crm ? db.lead.findMany({
      where: { stage: { in: ['new', 'contacted', 'proposal', 'negotiation'] } },
      select: { stage: true, value: true, expectedClose: true }, take: 10_000,
    }) : [],
    db.transaction.findMany({ select: { type: true, date: true, amount: true, currency: true }, take: 20_000 }),
    db.invoice.findMany({ select: { status: true, items: true, payments: true, vat: true, currency: true }, take: 10_000 }),
    db.user.count({ where: { status: 'active', userType: 'employee' } }),
    enabled.livestream ? db.liveSession.findMany({
      select: { date: true, status: true, gmv: true, netGmv: true, netReceived: true, settledDate: true }, take: 10_000,
    }) : [],
  ]);
  return buildCeoExecutiveSnapshot({
    identity,
    settings,
    capabilities: enabled,
    records: { approvals, tasks, workQueueStates, incidents, leads, transactions, invoices, activeHeadcount, liveSessions },
    asOf: now,
  });
}
