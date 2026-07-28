import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildCeoUnifiedDashboard,
  CEO_DASHBOARD_CONTRACT,
  CEO_DASHBOARD_FRESH_MS,
  CEO_DASHBOARD_STALE_MS,
  assertCeoDashboardUpstreamOrigin,
  sanitizeCeoRemoteSnapshot,
} from '../lib/ceo-unified-dashboard.js';
import { loadCeoUnifiedDashboard, refreshCeoUnifiedDashboard } from '../lib/ceo-unified-dashboard-admin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-21T23:00:00.000Z');
const DIRECTOR = { id: 'director-1', name: 'Vũ Lương Sơn', role: 'DIRECTOR', roles: ['DIRECTOR'] };

const entities = () => [
  {
    id: 'aim', displayName: 'AIm Agency', baseUrl: 'https://agency-erp-mu.vercel.app', businessProfile: 'agency',
    capabilities: '["finance","crm","delivery","support","people"]', environment: 'staging', enabled: true,
    status: 'ready', credentialRef: 'CEO_ENTITY_AIM_API_KEY', contractVersion: '1.0.0', schemaVersion: 1,
    consecutiveErrors: 0, lastErrorCode: null, circuitState: 'closed', circuitRetryAt: null,
  },
  {
    id: 'egolive', displayName: 'Egolive', baseUrl: 'https://erp-egolive.vercel.app', businessProfile: 'livestream',
    capabilities: '["finance","delivery","people","livestream"]', environment: 'staging', enabled: true,
    status: 'ready', credentialRef: 'CEO_ENTITY_EGOLIVE_API_KEY', contractVersion: '1.0.0', schemaVersion: 1,
    consecutiveErrors: 0, lastErrorCode: null, circuitState: 'closed', circuitRetryAt: null,
  },
  {
    id: 'vnecom', displayName: 'Vnecom LLC', baseUrl: 'https://erp-vnecom.vercel.app', businessProfile: 'entity-specific',
    capabilities: '["finance","crm"]', environment: 'staging', enabled: false, status: 'disabled',
    credentialRef: 'CEO_ENTITY_VNECOM_API_KEY', contractVersion: '1.0.0', schemaVersion: 1,
    consecutiveErrors: 0, lastErrorCode: null, circuitState: 'closed', circuitRetryAt: null,
  },
];

function snapshot(entity, { asOf = NOW, currency = 'VND', revenueCash = 100, gmv = 0 } = {}) {
  const domains = {};
  if (entity.capabilities.includes('finance')) domains.finance = {
    basis: 'cash-ledger-operating-view', revenueCash, revenueCashPrevious: 80, expenseCash: 40,
    operatingCashNet: revenueCash - 40, cashBalance: 900, accountsReceivable: 120,
    accountsPayable: 50, monthlyTarget: 500, accountingProfitClaimed: false,
  };
  if (entity.capabilities.includes('crm')) domains.crm = { pipelineValue: 700, pipelineCount: 7, winRate: 50, clients: 12 };
  if (entity.capabilities.includes('delivery')) domains.delivery = { projectsActive: 3, projectsLate: 1, tasksOpen: 8, tasksOverdue: 2 };
  if (entity.capabilities.includes('support')) domains.support = { ticketsOpen: 4, slaBreaches: 1 };
  if (entity.capabilities.includes('people')) domains.people = { activeHeadcount: 9, includesSalaryOrPayroll: false, employeeRankingEnabled: false };
  if (entity.capabilities.includes('livestream')) domains.livestream = {
    gmvOnStream: gmv, netReceivedReconciled: 300, pendingReconciliation: 2,
    pendingPlatformSettlement: 150, gmvIsRevenue: false,
  };
  return {
    contract: 'repositoryrealms.ceo.snapshot', contractVersion: '1.0.0', schemaVersion: 1,
    entityId: entity.id, asOf: asOf.toISOString(), entity: { id: entity.id, displayName: entity.displayName, businessProfile: entity.businessProfile },
    period: '2026-07', currency, timezone: 'Asia/Ho_Chi_Minh',
    scope: { grantedDomains: Object.keys(domains) }, domains,
    provenance: { source: 'canonical-entity-database', generatedBy: 'RepositoryRealms', directDatabaseWriteEnabled: false },
  };
}

function cache(entity, payload, { fetchedAt = NOW, fresh = true, stale = true } = {}) {
  return {
    id: `cache-${entity.id}`, entityId: entity.id, contractVersion: '1.0.0', schemaVersion: 1,
    snapshotJson: JSON.stringify(payload), sourceAsOf: new Date(payload.asOf), fetchedAt,
    freshUntil: new Date(fetchedAt.getTime() + (fresh ? CEO_DASHBOARD_FRESH_MS : -1)),
    staleUntil: new Date(fetchedAt.getTime() + (stale ? CEO_DASHBOARD_STALE_MS : -1)),
  };
}

function fixture(initialCaches = []) {
  const state = { entities: entities(), caches: initialCaches.map((row) => ({ ...row })), audits: [] };
  const tx = {
    ceoEntityRegistry: {
      findMany: async () => state.entities.map((row) => ({ ...row })),
      findUnique: async ({ where }) => state.entities.find((row) => row.id === where.id) || null,
      update: async ({ where, data }) => {
        const row = state.entities.find((item) => item.id === where.id);
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const row = state.entities.find((item) => item.id === where.id && (where.consecutiveErrors === undefined || item.consecutiveErrors === where.consecutiveErrors));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    ceoEntitySnapshotCache: {
      findMany: async ({ where }) => state.caches.filter((row) => where.entityId.in.includes(row.entityId)).map((row) => ({ ...row })),
      upsert: async ({ where, create, update }) => {
        let row = state.caches.find((item) => item.entityId === where.entityId);
        if (row) Object.assign(row, update);
        else { row = { id: `cache-${where.entityId}`, ...create }; state.caches.push(row); }
        return { ...row };
      },
    },
    ceoRolloutState: { findUnique: async ({ where }) => ({ entityId: where.entityId, currentRing: 'read_only', status: 'active', recordVersion: 2 }) },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return { db: { ...tx, $transaction: async (operation) => operation(tx) }, state };
}

test('CEO-4 accepts only whitelisted aggregate snapshots and enforces semantic invariants', () => {
  const aim = entities()[0];
  const valid = sanitizeCeoRemoteSnapshot(snapshot(aim), aim, NOW);
  assert.equal(valid.entityId, 'aim');
  assert.deepEqual(Object.keys(valid.domains), ['finance', 'crm', 'delivery', 'support', 'people']);
  assert.equal(valid.provenance.directDatabaseWriteEnabled, false);

  const wrongAudience = { ...snapshot(aim), entityId: 'egoric' };
  assert.throws(() => sanitizeCeoRemoteSnapshot(wrongAudience, aim, NOW), (error) => error.code === 'ceo_dashboard_audience_mismatch');
  const leaked = snapshot(aim); leaked.domains.crm.topLeadNames = ['Private lead'];
  assert.throws(() => sanitizeCeoRemoteSnapshot(leaked, aim, NOW), (error) => error.code === 'ceo_dashboard_domain_field_unsupported');
  const profit = snapshot(aim); profit.domains.finance.accountingProfitClaimed = true;
  assert.throws(() => sanitizeCeoRemoteSnapshot(profit, aim, NOW), (error) => error.code === 'ceo_dashboard_profit_claim_rejected');
  const people = snapshot(aim); people.domains.people.includesSalaryOrPayroll = true;
  assert.throws(() => sanitizeCeoRemoteSnapshot(people, aim, NOW), (error) => error.code === 'ceo_dashboard_people_scope_rejected');
  const future = snapshot(aim, { asOf: new Date(NOW.getTime() + 6 * 60_000) });
  assert.throws(() => sanitizeCeoRemoteSnapshot(future, aim, NOW), (error) => error.code === 'ceo_dashboard_as_of_future');
  assert.equal(assertCeoDashboardUpstreamOrigin(aim), aim.baseUrl);
  assert.throws(
    () => assertCeoDashboardUpstreamOrigin({ ...aim, baseUrl: 'https://credential-thief.example' }),
    (error) => error.code === 'ceo_dashboard_origin_untrusted',
  );
  assert.equal(
    assertCeoDashboardUpstreamOrigin({ ...aim, baseUrl: 'https://aim-staging.example' }, ['https://aim-staging.example']),
    'https://aim-staging.example',
  );
});

test('All companies groups money by currency, keeps GMV separate and excludes expired cache totals', () => {
  const [aim, egolive, vnecom] = entities();
  const aimCache = cache(aim, snapshot(aim, { currency: 'VND', revenueCash: 1_000 }));
  const liveCache = cache(egolive, snapshot(egolive, { currency: 'USD', revenueCash: 20, gmv: 4_000 }), { fresh: false, stale: true });
  const expired = cache(vnecom, snapshot(vnecom, { revenueCash: 99_000 }), { fresh: false, stale: false });
  const dashboard = buildCeoUnifiedDashboard({ registryEntities: [aim, egolive, { ...vnecom, enabled: true }], caches: [aimCache, liveCache, expired], now: NOW });
  assert.equal(dashboard.contract, CEO_DASHBOARD_CONTRACT);
  assert.deepEqual(dashboard.portfolio.finance.revenueCashByCurrency, [{ currency: 'USD', value: 20 }, { currency: 'VND', value: 1_000 }]);
  assert.deepEqual(dashboard.portfolio.livestream.gmvByCurrency, [{ currency: 'USD', value: 4_000 }]);
  assert.equal(dashboard.portfolio.livestream.gmvIsRevenue, false);
  assert.equal(dashboard.health.fresh, 1);
  assert.equal(dashboard.health.stale, 1);
  assert.equal(dashboard.health.unavailable, 1);
  assert.equal(dashboard.cachePolicy.expiredSnapshotsIncludedInTotals, false);
});

test('refresh fetches each enabled entity with its server credential and persists only sanitized caches', async () => {
  const { db, state } = fixture();
  const seen = [];
  const fetchImpl = async (url, options) => {
    const entity = state.entities.find((row) => new URL(row.baseUrl).host === url.host);
    seen.push({ entityId: entity.id, authorization: options.headers.Authorization, redirect: options.redirect });
    return new Response(JSON.stringify(snapshot(entity, { gmv: entity.id === 'egolive' ? 5_000 : 0 })), { status: 200 });
  };
  const result = await refreshCeoUnifiedDashboard(db, DIRECTOR, { entityId: 'all' }, {
    now: NOW, fetchImpl, secretResolver: (name) => `secret-for-${name}`, timeoutMs: 1_000,
  });
  assert.equal(result.refresh.attempted, 2);
  assert.equal(result.refresh.succeeded, 2);
  assert.equal(result.refresh.failed, 0);
  assert.equal(state.caches.length, 2);
  assert.equal(state.audits.length, 2);
  assert.equal(seen.every((item) => item.authorization.startsWith('Bearer secret-for-') && item.redirect === 'error'), true);
  assert.equal(JSON.stringify(state).includes('Bearer secret-for-'), false, 'raw entity credentials must never be stored');
  assert.equal(result.health.available, 2);
  assert.equal(state.entities.find((row) => row.id === 'vnecom').status, 'disabled');
});

test('an upstream outage keeps a usable stale snapshot and degrades only the failed entity', async () => {
  const rows = entities();
  const staleAim = cache(rows[0], snapshot(rows[0], { revenueCash: 321 }), { fetchedAt: new Date(NOW.getTime() - 10 * 60_000), fresh: false, stale: true });
  const { db, state } = fixture([staleAim]);
  const result = await refreshCeoUnifiedDashboard(db, DIRECTOR, { entityId: 'all' }, {
    now: NOW,
    fetchImpl: async (url) => {
      const entity = state.entities.find((row) => new URL(row.baseUrl).host === url.host);
      if (entity.id === 'aim') throw Object.assign(new Error('timeout'), { name: 'AbortError' });
      return new Response(JSON.stringify(snapshot(entity, { gmv: 800 })), { status: 200 });
    },
    secretResolver: () => 'entity-secret', timeoutMs: 1_000,
  });
  assert.equal(result.refresh.succeeded, 1);
  assert.equal(result.refresh.failed, 1);
  assert.equal(result.entities.find((row) => row.id === 'aim').freshness.state, 'stale');
  assert.equal(result.entities.find((row) => row.id === 'aim').snapshot.domains.finance.revenueCash, 321);
  assert.equal(state.entities.find((row) => row.id === 'aim').status, 'degraded');
  assert.equal(state.entities.find((row) => row.id === 'aim').lastErrorCode, 'ceo_dashboard_upstream_timeout');
});

test('background refresh reuses fresh cache while an explicit force refresh remains available', async () => {
  const rows = entities();
  const { db } = fixture([
    cache(rows[0], snapshot(rows[0])),
    cache(rows[1], snapshot(rows[1], { gmv: 1_200 })),
  ]);
  const result = await refreshCeoUnifiedDashboard(db, DIRECTOR, { entityId: 'all' }, {
    now: NOW,
    fetchImpl: async () => { throw new Error('fresh cache must prevent an upstream call'); },
    secretResolver: () => 'entity-secret',
  });
  assert.equal(result.refresh.attempted, 0);
  assert.equal(result.refresh.skippedFresh, 2);
  assert.equal(result.health.available, 2);
});

test('dashboard reads are Director-only and unknown entity filters fail closed', async () => {
  const { db } = fixture();
  await assert.rejects(() => loadCeoUnifiedDashboard(db, { roles: ['STAFF'] }), (error) => error.code === 'ceo_dashboard_director_required');
  await assert.rejects(() => loadCeoUnifiedDashboard(db, DIRECTOR, { entityId: 'unknown' }), (error) => error.code === 'ceo_dashboard_entity_not_found');
  const result = await loadCeoUnifiedDashboard(db, DIRECTOR, { entityId: 'vnecom', now: NOW });
  assert.equal(result.entities.length, 1);
  assert.equal(result.entities[0].freshness.state, 'disabled');
});

test('CEO-4 routes and UI preserve read-only access, provenance, accessibility and signed SSO drill-down', () => {
  const readRoute = fs.readFileSync(path.join(root, 'app/api/ceo/v1/dashboard/route.js'), 'utf8');
  const refreshRoute = fs.readFileSync(path.join(root, 'app/api/ceo/v1/dashboard/refresh/route.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'app/(app)/ceo-overview/page.jsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'app/(app)/ceo-overview/overview.module.css'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'lib/erp-navigation.js'), 'utf8');
  assert.match(readRoute, /currentUser\(\)/);
  assert.match(readRoute, /isDirector\(user\)/);
  assert.match(readRoute, /private, no-cache, no-store/);
  assert.match(refreshRoute, /ceoRequestIsSameOrigin/);
  assert.doesNotMatch(`${readRoute}\n${refreshRoute}`, /export async function (PUT|PATCH|DELETE)/);
  assert.match(page, /data-no-i18n/);
  assert.match(page, /aria-pressed/);
  assert.match(page, /<caption>/);
  assert.match(page, /\/api\/ceo\/v1\/sso\/authorize/);
  assert.match(page, /entity\.provenance/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 560px/);
  assert.match(nav, /key: 'ceo-overview'/);
});

test('CEO-4 migration stores only validated aggregate JSON behind a restricted entity relation', () => {
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260721230000_add_ceo_unified_dashboard/migration.sql'), 'utf8');
  assert.match(schema, /model CeoEntitySnapshotCache/);
  assert.match(schema, /entityId\s+String\s+@unique/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /credential|password|salary|payroll|leadName|clientName/i);
  assert.match(migration, /"snapshotJson" TEXT NOT NULL/);
});
