import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CEO_CONTRACT_NAMES,
  CEO_CONTRACT_VERSION,
  buildCeoCapabilities,
  buildCeoHealth,
  buildCeoSnapshot,
  resolveCeoEntityIdentity,
} from '../lib/ceo-entity-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-21T15:30:00.000Z');

test('CEO entity identity resolves the four stable production hostnames', () => {
  assert.equal(resolveCeoEntityIdentity({ runtimeUrl: 'https://agency-erp-mu.vercel.app' }).id, 'aim');
  assert.equal(resolveCeoEntityIdentity({ runtimeUrl: 'https://erp-egoric.vercel.app' }).id, 'egoric');
  assert.equal(resolveCeoEntityIdentity({ runtimeUrl: 'https://erp-vnecom.vercel.app' }).id, 'vnecom');
  assert.equal(resolveCeoEntityIdentity({ runtimeUrl: 'https://erp-egolive.vercel.app' }).id, 'egolive');
  assert.equal(resolveCeoEntityIdentity({ runtimeUrl: 'erp-egolive.vercel.app' }).id, 'egolive');
  assert.equal(resolveCeoEntityIdentity({ settings: { company: 'Realm Staging' }, explicitEntityId: 'realm-staging' }).id, 'realm-staging');
});

test('Agency capabilities expose legacy agency domains but not specialist verticals', () => {
  const identity = resolveCeoEntityIdentity({ runtimeUrl: 'https://erp-egoric.vercel.app', settings: { company: 'Egoric Agency' } });
  const payload = buildCeoCapabilities({ identity, settings: { company: 'Egoric Agency' }, asOf: NOW });

  assert.equal(payload.contract, CEO_CONTRACT_NAMES.capabilities);
  assert.equal(payload.contractVersion, CEO_CONTRACT_VERSION);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.entityId, 'egoric');
  assert.equal(payload.capabilities.domains.crm, true);
  assert.equal(payload.capabilities.domains.delivery, true);
  assert.equal(payload.capabilities.domains.livestream, false);
  assert.equal(payload.capabilities.domains.export, false);
  assert.deepEqual(payload.capabilities.commands.map((command) => command.action), [
    'task.create', 'status.request', 'announcement.send', 'approval.request', 'group_workforce.request',
  ]);
  assert.equal(payload.capabilities.modes.snapshotReadOnly, true);
  assert.equal(payload.capabilities.modes.crossEntityWrites, true);
  assert.equal(payload.capabilities.modes.directDatabaseWrites, false);
});

test('Agency snapshot is scoped, cash-basis and never claims accounting profit', () => {
  const identity = { id: 'aim', displayName: 'AIm Agency', businessProfile: 'agency' };
  const payload = buildCeoSnapshot({
    identity,
    settings: { company: 'AIm Agency', modules: ['sales', 'tasks', 'delivery', 'support'], monthlyTarget: 500_000_000 },
    requestedDomains: 'finance,crm,livestream,unknown',
    asOf: NOW,
    records: {
      transactions: [
        { type: 'income', date: '2026-07-02', amount: 100_000_000 },
        { type: 'expense', date: '2026-07-03', amount: 30_000_000 },
        { type: 'income', date: '2026-06-20', amount: 80_000_000 },
      ],
      invoices: [{ status: 'sent', items: JSON.stringify([{ qty: 1, price: 50_000_000 }]), payments: JSON.stringify([{ amount: 20_000_000 }]), vat: 10 }],
      vendorBills: [{ status: 'pending', amount: 12_000_000 }],
      leads: [
        { stage: 'new', value: 40_000_000 },
        { stage: 'won', value: 20_000_000 },
        { stage: 'lost', value: 10_000_000 },
      ],
      clientCount: 7,
      activeHeadcount: 12,
    },
  });

  assert.equal(payload.contract, CEO_CONTRACT_NAMES.snapshot);
  assert.deepEqual(payload.scope.grantedDomains, ['finance', 'crm']);
  assert.deepEqual(payload.scope.deniedDomains, ['livestream', 'unknown']);
  assert.equal(payload.domains.finance.revenueCash, 100_000_000);
  assert.equal(payload.domains.finance.revenueCashPrevious, 80_000_000);
  assert.equal(payload.domains.finance.expenseCash, 30_000_000);
  assert.equal(payload.domains.finance.operatingCashNet, 70_000_000);
  assert.equal(payload.domains.finance.accountsReceivable, 35_000_000);
  assert.equal(payload.domains.finance.accountsPayable, 12_000_000);
  assert.equal(payload.domains.finance.accountingProfitClaimed, false);
  assert.equal(Object.hasOwn(payload.domains.finance, 'profit'), false);
  assert.equal(payload.domains.crm.pipelineValue, 40_000_000);
  assert.equal(payload.domains.crm.winRate, 50);
  assert.equal(payload.domains.livestream, undefined);
});

test('Egolive contract keeps GMV separate from finance revenue', () => {
  const settings = {
    company: 'Egolive',
    modules: ['tasks', 'commissions', 'freelancers', 'reviews', 'livestream'],
  };
  const identity = resolveCeoEntityIdentity({ runtimeUrl: 'https://erp-egolive.vercel.app', settings });
  const capabilities = buildCeoCapabilities({ identity, settings, asOf: NOW });
  assert.equal(capabilities.capabilities.domains.livestream, true);
  assert.equal(capabilities.capabilities.domains.crm, false);

  const payload = buildCeoSnapshot({
    identity,
    settings,
    requestedDomains: 'finance,livestream',
    asOf: NOW,
    records: {
      transactions: [{ type: 'income', date: '2026-07-20', amount: 10_000_000 }],
      invoices: [],
      vendorBills: [],
      activeHeadcount: 4,
      liveSessions: [
        { date: '2026-07-18', status: 'reconciled', gmv: 100_000_000, netReceived: 64_000_000, settledDate: null },
        { date: '2026-07-19', status: 'done', gmv: 40_000_000, netReceived: 0, settledDate: null },
      ],
    },
  });

  assert.equal(payload.entity.businessProfile, 'livestream');
  assert.equal(payload.domains.finance.revenueCash, 10_000_000);
  assert.equal(payload.domains.livestream.gmvOnStream, 140_000_000);
  assert.equal(payload.domains.livestream.netReceivedReconciled, 64_000_000);
  assert.equal(payload.domains.livestream.pendingReconciliation, 1);
  assert.equal(payload.domains.livestream.pendingPlatformSettlement, 64_000_000);
  assert.equal(payload.domains.livestream.gmvIsRevenue, false);
});

test('CEO health contract is versioned and fail-closed when settings are absent', () => {
  const identity = { id: 'egoric', displayName: 'Egoric Agency', businessProfile: 'agency' };
  const ready = buildCeoHealth({ identity, databaseLatencyMs: 18.4, settingsLoaded: true, asOf: NOW });
  const degraded = buildCeoHealth({ identity, databaseLatencyMs: Number.NaN, settingsLoaded: false, asOf: NOW });

  assert.equal(ready.contract, CEO_CONTRACT_NAMES.health);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.latencyMs.database, 18);
  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.checks.database, 'unavailable');
  assert.equal(degraded.latencyMs.database, null);
});

test('CEO v1 routes require audience-bound service scopes and private no-store responses', () => {
  for (const endpoint of ['snapshot', 'capabilities', 'health']) {
    const source = fs.readFileSync(path.join(root, `app/api/ceo/v1/${endpoint}/route.js`), 'utf8');
    assert.match(source, /ceoServiceGuard\(req, CEO_SERVICE_SCOPES\./, `${endpoint} authenticates a scoped service credential`);
    assert.match(source, /private, no-store/, `${endpoint} disables shared caching`);
    assert.match(source, /X-CEO-Contract-Version/, `${endpoint} publishes the contract version`);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/, `${endpoint} is read-only`);
  }
});
