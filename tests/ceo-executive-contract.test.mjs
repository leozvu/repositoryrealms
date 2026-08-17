import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CEO_EXECUTIVE_CONTRACT,
  CEO_EXECUTIVE_CONTRACT_VERSION,
  buildCeoExecutiveSnapshot,
  sanitizeCeoExecutiveSnapshot,
} from '../lib/ceo-executive-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function snapshot(overrides = {}) {
  return buildCeoExecutiveSnapshot({
    identity: { id: 'egolive', displayName: 'Egolive', businessProfile: 'livestream' },
    settings: {
      currency: 'VND', timezone: 'Asia/Ho_Chi_Minh',
      probNew: 10, probContacted: 20, probProposal: 40, probNegotiation: 60,
    },
    capabilities: { crm: true, support: true, livestream: true },
    records: {
      approvals: [
        { type: 'expense', status: 'pending', createdAt: new Date('2026-07-20T00:00:00Z') },
        { type: 'leave', status: 'pending', createdAt: new Date('2026-07-21T00:00:00Z') },
      ],
      tasks: [
        { status: 'doing', assigneeId: 'u1' }, { status: 'todo', assigneeId: 'u1' }, { status: 'done', assigneeId: 'u2' },
      ],
      workQueueStates: [{ ownerId: 'u1', wipLimit: 2 }, { ownerId: 'u2', wipLimit: 3 }],
      incidents: [{ id: 'inc-1', code: 'INC-1', priority: 'urgent', status: 'open', updatedAt: NOW, dueAt: null }],
      leads: [
        { stage: 'new', value: 1_000_000, expectedClose: null },
        { stage: 'proposal', value: 2_000_000, expectedClose: '2026-07-30' },
      ],
      transactions: [
        { type: 'income', date: '2026-07-02', amount: 2_000_000, currency: 'VND' },
        { type: 'income', date: '2026-07-03', amount: 100, currency: 'USD' },
        { type: 'expense', date: '2026-07-04', amount: 500_000, currency: 'VND' },
      ],
      invoices: [
        { status: 'sent', currency: 'USD', items: '[{"qty":2,"price":100}]', vat: 0, payments: '[{"amount":50}]' },
      ],
      activeHeadcount: 8,
      liveSessions: [
        { date: '2026-07-15', status: 'reconciled', gmv: 10_000_000, netGmv: 8_000_000, netReceived: 7_000_000, settledDate: null },
        { date: '2026-07-16', status: 'done', gmv: 4_000_000, netGmv: 0, netReceived: 0, settledDate: null },
      ],
    },
    asOf: NOW,
    ...overrides,
  });
}

test('CEO-17 executive contract keeps provenance, currencies and livestream money classes separate', () => {
  const value = snapshot();
  assert.equal(value.contract, CEO_EXECUTIVE_CONTRACT);
  assert.equal(value.contractVersion, CEO_EXECUTIVE_CONTRACT_VERSION);
  assert.equal(value.sections.approvals.pendingCount, 2);
  assert.equal(value.sections.capacity.saturatedQueues, 1);
  assert.equal(value.sections.capacity.context.includes('not an individual productivity score'), true);
  assert.equal(value.sections.incidents.items[0].id, 'inc-1');
  assert.equal(Object.hasOwn(value.sections.incidents.items[0], 'title'), false);
  assert.equal(value.sections.forecast.weightedPipeline, 900_000);
  assert.deepEqual(value.sections.accounting.cashLedger.inflow, [
    { currency: 'USD', value: 100 }, { currency: 'VND', value: 2_000_000 },
  ]);
  assert.deepEqual(value.sections.accounting.cashLedger.receivables, [{ currency: 'USD', value: 150 }]);
  assert.equal(value.sections.accounting.recognizedRevenue.available, false);
  assert.equal(value.sections.accounting.accountingProfit.available, false);
  assert.equal(value.sections.livestream.gmvOnStream, 14_000_000);
  assert.equal(value.sections.livestream.netGmvReconciled, 8_000_000);
  assert.equal(value.sections.livestream.netReceivedReconciled, 7_000_000);
  assert.equal(value.sections.livestream.gmvIsRevenue, false);
});

test('CEO-17 forecast fails closed without configured probabilities and sanitizer rejects GMV-as-revenue', () => {
  const value = snapshot({ settings: { currency: 'VND' } });
  assert.equal(value.sections.forecast.available, false);
  assert.equal(value.sections.forecast.reason, 'stage_probability_not_configured');
  assert.throws(
    () => sanitizeCeoExecutiveSnapshot({
      ...snapshot(), sections: { ...snapshot().sections, livestream: { ...snapshot().sections.livestream, gmvIsRevenue: true } },
    }, 'egolive'),
    (error) => error.code === 'ceo_executive_gmv_claim_rejected',
  );
});

test('CEO-17 is additive and leaves both CEO snapshot v1 and lead-snapshot v1 contracts untouched', () => {
  const targetRoute = fs.readFileSync(path.join(root, 'app/api/ceo/v2/executive-snapshot/route.js'), 'utf8');
  const portalRoute = fs.readFileSync(path.join(root, 'app/api/ceo/v2/executive-workspace/route.js'), 'utf8');
  const v1Contract = fs.readFileSync(path.join(root, 'lib/ceo-entity-contract.js'), 'utf8');
  assert.match(targetRoute, /SNAPSHOT_READ/);
  assert.match(targetRoute, /private, no-store/);
  assert.match(portalRoute, /readCeoPortalSessionCookie/);
  assert.match(v1Contract, /repositoryrealms\.ceo\.snapshot/);
  assert.equal(targetRoute.includes('lead-snapshot'), false);
  assert.equal(portalRoute.includes('lead-snapshot'), false);
});
