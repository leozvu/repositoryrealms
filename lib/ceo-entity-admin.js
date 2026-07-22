import { prisma } from './prisma.js';
import {
  buildCeoCapabilities,
  buildCeoCapabilityModel,
  buildCeoHealth,
  buildCeoSnapshot,
  parseCeoSettings,
  resolveCeoEntityIdentity,
} from './ceo-entity-contract.js';

function identity(settings) {
  return resolveCeoEntityIdentity({
    settings,
    explicitEntityId: process.env.CEO_ENTITY_ID,
    runtimeUrl: process.env.NEXTAUTH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL,
    databaseUrl: process.env.DATABASE_URL,
  });
}

async function context(db = prisma) {
  const settingRow = await db.setting.findUnique({ where: { id: 1 } });
  const settings = parseCeoSettings(settingRow);
  return { settings, identity: identity(settings) };
}

export async function loadCeoCapabilities(db = prisma, now = new Date()) {
  const current = await context(db);
  return buildCeoCapabilities({ ...current, asOf: now });
}

export async function loadCeoSnapshot(db = prisma, { requestedDomains = null, now = new Date() } = {}) {
  const current = await context(db);
  const capabilityModel = buildCeoCapabilityModel(current);
  const enabled = capabilityModel.domains;
  const [transactions, invoices, vendorBills, leads, projects, tasks, clientCount, tickets, activeHeadcount, shipments, stockLots, liveSessions] = await Promise.all([
    db.transaction.findMany({ select: { type: true, date: true, amount: true } }),
    db.invoice.findMany({ select: { status: true, items: true, payments: true, vat: true } }),
    db.vendorBill.findMany({ select: { status: true, amount: true } }),
    enabled.crm ? db.lead.findMany({ select: { stage: true, value: true } }) : [],
    enabled.delivery ? db.project.findMany({ select: { status: true, deadline: true } }) : [],
    enabled.delivery ? db.task.findMany({ select: { status: true, dueDate: true } }) : [],
    enabled.crm ? db.client.count() : 0,
    enabled.support ? db.ticket.findMany({ select: { status: true, dueAt: true } }) : [],
    db.user.count({ where: { status: 'active' } }),
    enabled.export ? db.shipment.findMany({ select: { status: true } }) : [],
    enabled.inventory ? db.stockLot.findMany({ select: { qtyIn: true, qtyOut: true, unitCost: true } }) : [],
    enabled.livestream ? db.liveSession.findMany({ select: { date: true, status: true, gmv: true, netReceived: true, settledDate: true } }) : [],
  ]);

  return buildCeoSnapshot({
    ...current,
    requestedDomains,
    asOf: now,
    records: {
      transactions,
      invoices,
      vendorBills,
      leads,
      projects,
      tasks,
      clientCount,
      tickets,
      activeHeadcount,
      shipments,
      stockLots,
      liveSessions,
    },
  });
}

export async function loadCeoHealth(db = prisma, now = new Date()) {
  const startedAt = performance.now();
  const settingRow = await db.setting.findUnique({ where: { id: 1 } });
  await db.$queryRawUnsafe('SELECT 1 AS ready');
  const databaseLatencyMs = performance.now() - startedAt;
  const settings = parseCeoSettings(settingRow);
  return buildCeoHealth({
    identity: identity(settings),
    databaseLatencyMs,
    settingsLoaded: Boolean(settingRow),
    asOf: now,
  });
}
