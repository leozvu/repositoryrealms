import { CEO_CONTRACT_NAMES, CEO_CONTRACT_VERSION, CEO_DOMAIN_ORDER } from './ceo-entity-contract.js';
import { CEO_ENTITY_REGISTRY_SEED, parseCeoRegistryCapabilities } from './ceo-entity-registry.js';

export const CEO_DASHBOARD_CONTRACT = 'repositoryrealms.ceo.dashboard';
export const CEO_DASHBOARD_VERSION = 1;
export const CEO_DASHBOARD_FRESH_MS = 5 * 60_000;
export const CEO_DASHBOARD_STALE_MS = 24 * 60 * 60_000;
export const CEO_DASHBOARD_MAX_SNAPSHOT_BYTES = 256 * 1024;
export const CEO_DASHBOARD_FETCH_TIMEOUT_MS = 5_000;

const STATUS_ORDER = Object.freeze(['fresh', 'stale', 'expired', 'missing', 'invalid', 'disabled']);
const DOMAIN_FIELDS = Object.freeze({
  finance: {
    basis: 'string', revenueCash: 'number', revenueCashPrevious: 'number', expenseCash: 'number',
    operatingCashNet: 'number', cashBalance: 'number', accountsReceivable: 'number',
    accountsPayable: 'number', monthlyTarget: 'number', accountingProfitClaimed: 'boolean',
  },
  crm: { pipelineValue: 'number', pipelineCount: 'number', winRate: 'nullableNumber', clients: 'number' },
  delivery: { projectsActive: 'number', projectsLate: 'number', tasksOpen: 'number', tasksOverdue: 'number' },
  support: { ticketsOpen: 'number', slaBreaches: 'number' },
  people: { activeHeadcount: 'number', includesSalaryOrPayroll: 'boolean', employeeRankingEnabled: 'boolean' },
  export: { shipmentsActive: 'number', shipmentsUnpaid: 'number' },
  inventory: { inventoryCostValue: 'number', valuationBasis: 'string' },
  livestream: {
    gmvOnStream: 'number', netReceivedReconciled: 'number', pendingReconciliation: 'number',
    pendingPlatformSettlement: 'number', gmvIsRevenue: 'boolean',
  },
});

export const CEO_DASHBOARD_DRILLDOWNS = Object.freeze({
  finance: '/finance',
  crm: '/leads',
  delivery: '/portfolio',
  support: '/tickets',
  people: '/staff',
  export: '/shipments',
  inventory: '/inventory',
  livestream: '/live',
});

export class CeoDashboardError extends Error {
  constructor(message, status = 400, code = 'ceo_dashboard_invalid') {
    super(message);
    this.name = 'CeoDashboardError';
    this.status = status;
    this.code = code;
  }
}

export function assertCeoDashboardUpstreamOrigin(entity, additionalOrigins = []) {
  let configured;
  try {
    configured = new URL(entity?.baseUrl);
  } catch {
    throw new CeoDashboardError('Entity origin is invalid.', 502, 'ceo_dashboard_origin_invalid');
  }
  const canonical = CEO_ENTITY_REGISTRY_SEED.find((candidate) => candidate.id === entity?.id)?.baseUrl;
  const allowed = new Set([canonical, ...(Array.isArray(additionalOrigins) ? additionalOrigins : [])]
    .filter(Boolean)
    .map((value) => {
      try { return new URL(value).origin; } catch { return null; }
    })
    .filter(Boolean));
  if (configured.protocol !== 'https:' || configured.origin !== entity.baseUrl || !allowed.has(configured.origin)) {
    throw new CeoDashboardError('Entity origin is not allowlisted.', 502, 'ceo_dashboard_origin_untrusted');
  }
  return configured.origin;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeDate(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new CeoDashboardError('Snapshot timestamp is invalid.', 502, code);
  return date;
}

function safeString(value, code, max = 96) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f]/.test(normalized)) {
    throw new CeoDashboardError('Snapshot string is invalid.', 502, code);
  }
  return normalized;
}

function safeNumber(value, code, nullable = false) {
  if (nullable && value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER) {
    throw new CeoDashboardError('Snapshot number is invalid.', 502, code);
  }
  return number;
}

function sanitizeDomain(domain, value) {
  const schema = DOMAIN_FIELDS[domain];
  if (!schema || !plainObject(value)) {
    throw new CeoDashboardError('Snapshot domain is invalid.', 502, 'ceo_dashboard_domain_invalid');
  }
  const unknown = Object.keys(value).filter((field) => !Object.hasOwn(schema, field));
  if (unknown.length) {
    throw new CeoDashboardError('Snapshot contains an unsupported aggregate.', 502, 'ceo_dashboard_domain_field_unsupported');
  }
  const sanitized = {};
  for (const [field, type] of Object.entries(schema)) {
    if (!Object.hasOwn(value, field)) {
      throw new CeoDashboardError('Snapshot aggregate is incomplete.', 502, 'ceo_dashboard_domain_incomplete');
    }
    const code = `ceo_dashboard_${domain}_${field}_invalid`;
    if (type === 'number') sanitized[field] = safeNumber(value[field], code);
    else if (type === 'nullableNumber') sanitized[field] = safeNumber(value[field], code, true);
    else if (type === 'boolean') {
      if (typeof value[field] !== 'boolean') throw new CeoDashboardError('Snapshot flag is invalid.', 502, code);
      sanitized[field] = value[field];
    } else sanitized[field] = safeString(value[field], code);
  }
  if (domain === 'finance' && sanitized.accountingProfitClaimed !== false) {
    throw new CeoDashboardError('Accounting profit claims are not accepted.', 502, 'ceo_dashboard_profit_claim_rejected');
  }
  if (domain === 'people' && (sanitized.includesSalaryOrPayroll || sanitized.employeeRankingEnabled)) {
    throw new CeoDashboardError('Sensitive people aggregates are not accepted.', 502, 'ceo_dashboard_people_scope_rejected');
  }
  if (domain === 'livestream' && sanitized.gmvIsRevenue !== false) {
    throw new CeoDashboardError('Livestream GMV cannot be classified as revenue.', 502, 'ceo_dashboard_gmv_claim_rejected');
  }
  return sanitized;
}

export function sanitizeCeoRemoteSnapshot(input, registryEntity, now = new Date()) {
  if (!plainObject(input) || !registryEntity) {
    throw new CeoDashboardError('Snapshot payload is invalid.', 502, 'ceo_dashboard_snapshot_invalid');
  }
  const encoded = JSON.stringify(input);
  if (Buffer.byteLength(encoded, 'utf8') > CEO_DASHBOARD_MAX_SNAPSHOT_BYTES) {
    throw new CeoDashboardError('Snapshot payload is too large.', 502, 'ceo_dashboard_snapshot_too_large');
  }
  if (input.contract !== CEO_CONTRACT_NAMES.snapshot || input.contractVersion !== registryEntity.contractVersion) {
    throw new CeoDashboardError('Snapshot contract does not match the registry.', 502, 'ceo_dashboard_contract_mismatch');
  }
  if (input.entityId !== registryEntity.id || Number(input.schemaVersion) !== Number(registryEntity.schemaVersion)) {
    throw new CeoDashboardError('Snapshot audience does not match the registry.', 502, 'ceo_dashboard_audience_mismatch');
  }
  const asOf = safeDate(input.asOf, 'ceo_dashboard_as_of_invalid');
  if (asOf.getTime() > now.getTime() + 5 * 60_000) {
    throw new CeoDashboardError('Snapshot timestamp is in the future.', 502, 'ceo_dashboard_as_of_future');
  }
  const currency = safeString(input.currency, 'ceo_dashboard_currency_invalid', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new CeoDashboardError('Snapshot currency is invalid.', 502, 'ceo_dashboard_currency_invalid');
  }
  const timezone = safeString(input.timezone, 'ceo_dashboard_timezone_invalid', 64);
  const period = safeString(input.period, 'ceo_dashboard_period_invalid', 7);
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new CeoDashboardError('Snapshot period is invalid.', 502, 'ceo_dashboard_period_invalid');
  }
  if (!plainObject(input.domains)) {
    throw new CeoDashboardError('Snapshot domains are invalid.', 502, 'ceo_dashboard_domains_invalid');
  }
  const allowed = new Set(parseCeoRegistryCapabilities(registryEntity.capabilities));
  const domainNames = Object.keys(input.domains);
  const unauthorized = domainNames.filter((domain) => !CEO_DOMAIN_ORDER.includes(domain) || !allowed.has(domain));
  if (unauthorized.length) {
    throw new CeoDashboardError('Snapshot contains an unauthorized domain.', 502, 'ceo_dashboard_domain_unauthorized');
  }
  const domains = {};
  for (const domain of CEO_DOMAIN_ORDER) {
    if (Object.hasOwn(input.domains, domain)) domains[domain] = sanitizeDomain(domain, input.domains[domain]);
  }
  return {
    contract: CEO_CONTRACT_NAMES.snapshot,
    contractVersion: input.contractVersion,
    schemaVersion: Number(input.schemaVersion),
    entityId: registryEntity.id,
    asOf: asOf.toISOString(),
    entity: {
      id: registryEntity.id,
      displayName: registryEntity.displayName,
      businessProfile: registryEntity.businessProfile,
    },
    period,
    currency,
    timezone,
    scope: { grantedDomains: Object.keys(domains) },
    domains,
    provenance: {
      source: 'canonical-entity-database',
      generatedBy: 'RepositoryRealms',
      directDatabaseWriteEnabled: false,
    },
  };
}

export function ceoSnapshotFreshness(cache, now = new Date()) {
  if (!cache) return { state: 'missing', available: false, ageSeconds: null };
  const fetchedAt = safeDate(cache.fetchedAt, 'ceo_dashboard_cache_timestamp_invalid');
  const freshUntil = safeDate(cache.freshUntil, 'ceo_dashboard_cache_timestamp_invalid');
  const staleUntil = safeDate(cache.staleUntil, 'ceo_dashboard_cache_timestamp_invalid');
  const state = now <= freshUntil ? 'fresh' : now <= staleUntil ? 'stale' : 'expired';
  return {
    state,
    available: state === 'fresh' || state === 'stale',
    ageSeconds: Math.max(0, Math.floor((now.getTime() - fetchedAt.getTime()) / 1000)),
  };
}

function cacheByEntity(caches) {
  return new Map((caches || []).map((cache) => [cache.entityId, cache]));
}

function statusRank(value) {
  const index = STATUS_ORDER.indexOf(value);
  return index === -1 ? STATUS_ORDER.length : index;
}

function moneyTotals(rows, selector) {
  const totals = new Map();
  for (const row of rows) {
    const value = selector(row.snapshot);
    if (!Number.isFinite(value)) continue;
    totals.set(row.snapshot.currency, (totals.get(row.snapshot.currency) || 0) + value);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({ currency, value }));
}

function sumDomain(rows, domain, field) {
  return rows.reduce((total, row) => total + Number(row.snapshot.domains?.[domain]?.[field] || 0), 0);
}

export function buildCeoUnifiedDashboard({ registryEntities = [], caches = [], now = new Date(), entityId = 'all' } = {}) {
  const selected = entityId === 'all' ? registryEntities : registryEntities.filter((entity) => entity.id === entityId);
  const cacheMap = cacheByEntity(caches);
  const entities = selected.map((entity) => {
    const cache = cacheMap.get(entity.id) || null;
    let freshness = entity.enabled
      ? { state: cache ? 'invalid' : 'missing', available: false, ageSeconds: null }
      : { state: 'disabled', available: false, ageSeconds: null };
    let snapshot = null;
    let validationCode = null;
    if (cache && entity.enabled) {
      try {
        freshness = ceoSnapshotFreshness(cache, now);
        const parsed = JSON.parse(cache.snapshotJson);
        const sanitized = sanitizeCeoRemoteSnapshot(parsed, entity, now);
        if (freshness.available) snapshot = sanitized;
      } catch (error) {
        freshness = { state: 'invalid', available: false, ageSeconds: null };
        validationCode = error.code || 'ceo_dashboard_cache_invalid';
      }
    }
    return {
      id: entity.id,
      displayName: entity.displayName,
      businessProfile: entity.businessProfile,
      environment: entity.environment,
      enabled: Boolean(entity.enabled),
      registryStatus: entity.status,
      capabilities: parseCeoRegistryCapabilities(entity.capabilities),
      freshness: { ...freshness, validationCode },
      snapshot,
      provenance: cache && freshness.state !== 'invalid' ? {
        source: 'CEO aggregate cache',
        upstreamSource: snapshot?.provenance?.source || 'canonical-entity-database',
        contract: CEO_CONTRACT_NAMES.snapshot,
        contractVersion: cache.contractVersion,
        schemaVersion: cache.schemaVersion,
        sourceAsOf: new Date(cache.sourceAsOf).toISOString(),
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        freshUntil: new Date(cache.freshUntil).toISOString(),
        staleUntil: new Date(cache.staleUntil).toISOString(),
      } : null,
      drillDowns: Object.fromEntries(
        parseCeoRegistryCapabilities(entity.capabilities).map((domain) => [domain, CEO_DASHBOARD_DRILLDOWNS[domain]]),
      ),
      sync: {
        lastSuccessfulAt: entity.lastSuccessfulSyncAt || null,
        consecutiveErrors: Number(entity.consecutiveErrors || 0),
        lastErrorCode: entity.lastErrorCode || null,
        circuitState: entity.circuitState || 'open',
        circuitRetryAt: entity.circuitRetryAt || null,
      },
    };
  }).sort((a, b) => statusRank(a.freshness.state) - statusRank(b.freshness.state) || a.displayName.localeCompare(b.displayName));

  const available = entities.filter((entity) => entity.freshness.available && entity.snapshot);
  const finance = available.filter((entity) => entity.snapshot.domains.finance);
  const delivery = available.filter((entity) => entity.snapshot.domains.delivery);
  const people = available.filter((entity) => entity.snapshot.domains.people);
  const livestream = available.filter((entity) => entity.snapshot.domains.livestream);
  return {
    contract: CEO_DASHBOARD_CONTRACT,
    dashboardVersion: CEO_DASHBOARD_VERSION,
    contractVersion: CEO_CONTRACT_VERSION,
    asOf: now.toISOString(),
    filter: entityId,
    health: {
      registered: entities.length,
      available: available.length,
      fresh: entities.filter((entity) => entity.freshness.state === 'fresh').length,
      stale: entities.filter((entity) => entity.freshness.state === 'stale').length,
      unavailable: entities.filter((entity) => !entity.freshness.available).length,
    },
    portfolio: {
      finance: {
        revenueCashByCurrency: moneyTotals(finance, (snapshot) => snapshot.domains.finance.revenueCash),
        expenseCashByCurrency: moneyTotals(finance, (snapshot) => snapshot.domains.finance.expenseCash),
        cashBalanceByCurrency: moneyTotals(finance, (snapshot) => snapshot.domains.finance.cashBalance),
        entitiesContributing: finance.length,
        accountingProfitClaimed: false,
      },
      delivery: {
        projectsActive: sumDomain(delivery, 'delivery', 'projectsActive'),
        projectsLate: sumDomain(delivery, 'delivery', 'projectsLate'),
        tasksOpen: sumDomain(delivery, 'delivery', 'tasksOpen'),
        tasksOverdue: sumDomain(delivery, 'delivery', 'tasksOverdue'),
        entitiesContributing: delivery.length,
      },
      people: {
        activeHeadcount: sumDomain(people, 'people', 'activeHeadcount'),
        entitiesContributing: people.length,
        includesSalaryOrPayroll: false,
        employeeRankingEnabled: false,
      },
      livestream: {
        gmvByCurrency: moneyTotals(livestream, (snapshot) => snapshot.domains.livestream.gmvOnStream),
        netReceivedByCurrency: moneyTotals(livestream, (snapshot) => snapshot.domains.livestream.netReceivedReconciled),
        pendingReconciliation: sumDomain(livestream, 'livestream', 'pendingReconciliation'),
        entitiesContributing: livestream.length,
        gmvIsRevenue: false,
      },
    },
    entities,
    cachePolicy: {
      freshSeconds: Math.floor(CEO_DASHBOARD_FRESH_MS / 1000),
      staleIfErrorSeconds: Math.floor(CEO_DASHBOARD_STALE_MS / 1000),
      expiredSnapshotsIncludedInTotals: false,
    },
    provenance: {
      source: 'validated cached CEO v1 entity snapshots',
      generatedBy: 'RepositoryRealms CEO Portal',
      caveats: [
        'Currency totals are grouped and never silently converted.',
        'Cash-ledger operating data is not accounting profit.',
        'Livestream GMV is not revenue.',
        'Stale snapshots are labeled; expired snapshots are excluded from totals.',
      ],
    },
  };
}
