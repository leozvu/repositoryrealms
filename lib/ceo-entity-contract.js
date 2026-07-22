import { modOn } from './modules.js';
import { CEO_COMMAND_DEFINITIONS } from './ceo-command-gateway.js';
import { CEO_MESSAGING_SCOPES, CEO_MESSAGING_VERSION } from './ceo-messaging.js';
import { CEO_FEDERATION_SCOPE, CEO_FEDERATION_VERSION, normalizeCeoFederationPolicy } from './ceo-federation.js';

export const CEO_CONTRACT_VERSION = '1.0.0';
export const CEO_SCHEMA_VERSION = 1;
export const CEO_CONTRACT_NAMES = Object.freeze({
  snapshot: 'repositoryrealms.ceo.snapshot',
  capabilities: 'repositoryrealms.ceo.capabilities',
  health: 'repositoryrealms.ceo.health',
});

export const CEO_DOMAIN_ORDER = Object.freeze([
  'finance',
  'crm',
  'delivery',
  'support',
  'people',
  'export',
  'inventory',
  'livestream',
]);

const KNOWN_HOSTS = Object.freeze({
  'agency-erp-mu.vercel.app': { id: 'aim', name: 'AIm Agency', profile: 'agency' },
  'erp-egoric.vercel.app': { id: 'egoric', name: 'Egoric Agency', profile: 'agency' },
  'erp-vnecom.vercel.app': { id: 'vnecom', name: 'Vnecom LLC', profile: 'entity-specific' },
  'erp-egolive.vercel.app': { id: 'egolive', name: 'Egolive', profile: 'livestream' },
});

const KNOWN_SCHEMAS = Object.freeze({
  egoric: { id: 'egoric', name: 'Egoric Agency', profile: 'agency' },
  vnecom: { id: 'vnecom', name: 'Vnecom LLC', profile: 'entity-specific' },
  egolive: { id: 'egolive', name: 'Egolive', profile: 'livestream' },
});

function json(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function integer(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function slug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function hostname(value) {
  try {
    return new URL(String(value).includes('://') ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function schemaFromDatabaseUrl(value) {
  try {
    return new URL(value).searchParams.get('schema') || 'public';
  } catch {
    return null;
  }
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid CEO contract timestamp.');
  return date.toISOString();
}

function month(value) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonth(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return month(date);
}

function enabledModules(modules) {
  return {
    finance: true,
    crm: modOn('sales', modules),
    delivery: modOn('delivery', modules) || modOn('tasks', modules),
    support: modOn('support', modules),
    people: true,
    export: modOn('export', modules),
    inventory: modOn('inventory', modules),
    livestream: modOn('livestream', modules),
  };
}

function businessProfile(modules, fallback = 'agency') {
  if (modOn('livestream', modules)) return 'livestream';
  if (modOn('export', modules)) return 'export';
  return fallback;
}

export function parseCeoSettings(settingRow) {
  return json(settingRow?.json, {});
}

export function resolveCeoEntityIdentity({
  settings = {},
  explicitEntityId = null,
  runtimeUrl = null,
  databaseUrl = null,
} = {}) {
  const configuredId = slug(explicitEntityId || settings.entityId);
  const hostMatch = KNOWN_HOSTS[hostname(runtimeUrl)] || null;
  const schema = schemaFromDatabaseUrl(databaseUrl);
  const schemaMatch = schema && schema !== 'public' ? KNOWN_SCHEMAS[schema] || null : null;
  const known = hostMatch || schemaMatch;
  const id = configuredId || known?.id || slug(settings.company) || 'unconfigured-entity';
  const modules = Array.isArray(settings.modules) ? settings.modules : null;

  return {
    id,
    displayName: settings.company || known?.name || 'Unconfigured entity',
    businessProfile: businessProfile(modules, known?.profile || 'agency'),
  };
}

export function buildCeoCapabilityModel({ identity, settings = {} } = {}) {
  const modules = Array.isArray(settings.modules) ? settings.modules : null;
  const domains = enabledModules(modules);
  const commands = CEO_COMMAND_DEFINITIONS
    .filter((command) => domains[command.capability])
    .map((command) => ({ action: command.action, scope: command.scope, resource: command.resource }));
  const federationPolicy = normalizeCeoFederationPolicy(settings.ceoFederation);
  return {
    entity: identity,
    domains,
    enabledDomains: CEO_DOMAIN_ORDER.filter((domain) => domains[domain]),
    commands,
    messaging: {
      enabled: domains.people === true,
      contractVersion: CEO_MESSAGING_VERSION,
      scopes: domains.people ? [...CEO_MESSAGING_SCOPES] : [],
      directorySharing: 'explicit-opt-in',
      localAdapters: ['erp', 'realm'],
    },
    federation: {
      enabled: true,
      contractVersion: CEO_FEDERATION_VERSION,
      scope: CEO_FEDERATION_SCOPE,
      ssoGateway: true,
      presenceSharing: federationPolicy.presenceEnabled,
      presenceSharingMode: 'explicit-opt-in',
      crossEntityChatGrantsRecordAccess: false,
    },
    modes: {
      snapshotReadOnly: true,
      crossEntityWrites: commands.length > 0,
      directDatabaseWrites: false,
    },
  };
}

export function parseRequestedCeoDomains(value, capabilityModel) {
  const enabled = new Set(capabilityModel.enabledDomains);
  if (!value) return [...capabilityModel.enabledDomains];
  return [...new Set(String(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))]
    .filter((domain) => enabled.has(domain));
}

function envelope(contract, identity, asOf) {
  return {
    contract,
    contractVersion: CEO_CONTRACT_VERSION,
    schemaVersion: CEO_SCHEMA_VERSION,
    entityId: identity.id,
    asOf: iso(asOf),
  };
}

export function buildCeoCapabilities({ identity, settings = {}, asOf = new Date() } = {}) {
  const capabilityModel = buildCeoCapabilityModel({ identity, settings });
  return {
    ...envelope(CEO_CONTRACT_NAMES.capabilities, identity, asOf),
    entity: identity,
    currency: settings.currency || 'VND',
    timezone: settings.timezone || 'Asia/Ho_Chi_Minh',
    capabilities: capabilityModel,
    endpoints: {
      snapshot: '/api/ceo/v1/snapshot',
      capabilities: '/api/ceo/v1/capabilities',
      health: '/api/ceo/v1/health',
      commands: '/api/ceo/v1/commands',
      commandReceipts: '/api/ceo/v1/commands/receipts',
      directory: '/api/ceo/v1/directory',
      messageDelivery: '/api/ceo/v1/messaging/deliver',
      messageReceipts: '/api/ceo/v1/messaging/receipts',
      messageFeed: '/api/ceo/v1/messaging/feed',
      federationPresence: '/api/ceo/v1/federation/presence',
    },
  };
}

const items = (value) => json(value, []);
const invoiceGrand = (invoice) => Math.round(
  items(invoice.items).reduce((total, item) => total + Number(item.qty || 0) * Number(item.price || 0), 0)
  * (1 + Number(invoice.vat || 0) / 100),
);
const invoicePaid = (invoice) => items(invoice.payments).reduce((total, payment) => total + Number(payment.amount || 0), 0);
const sum = (rows, selector) => rows.reduce((total, row) => total + integer(selector(row)), 0);

export function buildCeoSnapshot({
  identity,
  settings = {},
  records = {},
  requestedDomains = null,
  asOf = new Date(),
} = {}) {
  const capabilityModel = buildCeoCapabilityModel({ identity, settings });
  const grantedDomains = requestedDomains
    ? parseRequestedCeoDomains(requestedDomains, capabilityModel)
    : [...capabilityModel.enabledDomains];
  const granted = new Set(grantedDomains);
  const currentMonth = month(asOf);
  const priorMonth = previousMonth(asOf);
  const today = iso(asOf).slice(0, 10);
  const transactions = records.transactions || [];
  const invoices = records.invoices || [];
  const bills = records.vendorBills || [];
  const leads = records.leads || [];
  const projects = records.projects || [];
  const tasks = records.tasks || [];
  const tickets = records.tickets || [];
  const liveSessions = records.liveSessions || [];
  const shipments = records.shipments || [];
  const stockLots = records.stockLots || [];
  const domains = {};

  if (granted.has('finance')) {
    const revenueCash = sum(transactions.filter((row) => row.type === 'income' && String(row.date || '').startsWith(currentMonth)), (row) => row.amount);
    const revenueCashPrevious = sum(transactions.filter((row) => row.type === 'income' && String(row.date || '').startsWith(priorMonth)), (row) => row.amount);
    const expenseCash = sum(transactions.filter((row) => row.type === 'expense' && String(row.date || '').startsWith(currentMonth)), (row) => row.amount);
    domains.finance = {
      basis: 'cash-ledger-operating-view',
      revenueCash,
      revenueCashPrevious,
      expenseCash,
      operatingCashNet: revenueCash - expenseCash,
      cashBalance: sum(transactions, (row) => row.type === 'income' ? row.amount : -Number(row.amount || 0)),
      accountsReceivable: sum(invoices.filter((row) => row.status !== 'draft'), (row) => Math.max(0, invoiceGrand(row) - invoicePaid(row))),
      accountsPayable: sum(bills.filter((row) => row.status !== 'paid'), (row) => row.amount),
      monthlyTarget: integer(settings.monthlyTarget),
      accountingProfitClaimed: false,
    };
  }

  if (granted.has('crm')) {
    const open = leads.filter((row) => !['won', 'lost'].includes(row.stage));
    const closed = leads.filter((row) => ['won', 'lost'].includes(row.stage));
    domains.crm = {
      pipelineValue: sum(open, (row) => row.value),
      pipelineCount: open.length,
      winRate: closed.length ? Math.round(leads.filter((row) => row.stage === 'won').length / closed.length * 100) : null,
      clients: integer(records.clientCount),
    };
  }

  if (granted.has('delivery')) {
    domains.delivery = {
      projectsActive: projects.filter((row) => row.status === 'active').length,
      projectsLate: projects.filter((row) => row.status === 'active' && row.deadline && row.deadline < today).length,
      tasksOpen: tasks.filter((row) => row.status !== 'done').length,
      tasksOverdue: tasks.filter((row) => row.status !== 'done' && row.dueDate && row.dueDate < today).length,
    };
  }

  if (granted.has('support')) {
    const open = tickets.filter((row) => !['resolved', 'closed'].includes(row.status));
    domains.support = {
      ticketsOpen: open.length,
      slaBreaches: open.filter((row) => row.dueAt && new Date(row.dueAt) < new Date(asOf)).length,
    };
  }

  if (granted.has('people')) {
    domains.people = {
      activeHeadcount: integer(records.activeHeadcount),
      includesSalaryOrPayroll: false,
      employeeRankingEnabled: false,
    };
  }

  if (granted.has('export')) {
    domains.export = {
      shipmentsActive: shipments.filter((row) => !['paid', 'draft'].includes(row.status)).length,
      shipmentsUnpaid: shipments.filter((row) => row.status !== 'paid').length,
    };
  }

  if (granted.has('inventory')) {
    domains.inventory = {
      inventoryCostValue: sum(stockLots, (row) => Math.max(0, Number(row.qtyIn || 0) - Number(row.qtyOut || 0)) * Number(row.unitCost || 0)),
      valuationBasis: 'identified-cost-proxy',
    };
  }

  if (granted.has('livestream')) {
    const monthly = liveSessions.filter((row) => String(row.date || '').startsWith(currentMonth));
    domains.livestream = {
      gmvOnStream: sum(monthly, (row) => row.gmv),
      netReceivedReconciled: sum(monthly.filter((row) => row.status === 'reconciled'), (row) => row.netReceived),
      pendingReconciliation: liveSessions.filter((row) => row.status === 'done').length,
      pendingPlatformSettlement: sum(liveSessions.filter((row) => row.status === 'reconciled' && !row.settledDate), (row) => row.netReceived),
      gmvIsRevenue: false,
    };
  }

  return {
    ...envelope(CEO_CONTRACT_NAMES.snapshot, identity, asOf),
    entity: identity,
    period: currentMonth,
    currency: settings.currency || 'VND',
    timezone: settings.timezone || 'Asia/Ho_Chi_Minh',
    scope: {
      requestedDomains: requestedDomains ? String(requestedDomains).split(',').map((item) => item.trim()).filter(Boolean) : null,
      grantedDomains,
      deniedDomains: requestedDomains
        ? String(requestedDomains).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).filter((domain) => !grantedDomains.includes(domain))
        : [],
    },
    domains,
    provenance: {
      source: 'canonical-entity-database',
      generatedBy: 'RepositoryRealms',
      directDatabaseWriteEnabled: false,
      caveats: [
        'Cash-ledger operating net is not accounting profit.',
        'Livestream GMV is not revenue and is never merged into finance revenue.',
        'Presence, Realm time and Gold are not employee-performance measures.',
      ],
    },
  };
}

export function buildCeoHealth({ identity, databaseLatencyMs, settingsLoaded, asOf = new Date() } = {}) {
  const ready = settingsLoaded && Number.isFinite(databaseLatencyMs);
  return {
    ...envelope(CEO_CONTRACT_NAMES.health, identity, asOf),
    entity: identity,
    status: ready ? 'ready' : 'degraded',
    checks: {
      database: Number.isFinite(databaseLatencyMs) ? 'ready' : 'unavailable',
      settings: settingsLoaded ? 'ready' : 'unavailable',
    },
    latencyMs: {
      database: Number.isFinite(databaseLatencyMs) ? Math.max(0, Math.round(databaseLatencyMs)) : null,
    },
  };
}
