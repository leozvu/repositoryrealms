import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildLocalCeoDecisionFeed,
  buildCeoUnifiedDecisionQueue,
  sanitizeCeoDecisionFeed,
} from '../lib/ceo-decision-queue.js';
import { buildCeoDailyBriefing } from '../lib/ceo-daily-briefing.js';
import { CEO_SERVICE_SCOPES } from '../lib/ceo-service-auth.js';
import { CEO_ROLLOUT_RING_DEFINITIONS } from '../lib/ceo-rollout.js';

const now = new Date('2026-08-01T12:00:00.000Z');

function approval(overrides = {}) {
  return {
    id: 'ap-1', type: 'expense', title: 'Duyệt khoản chi chiến dịch', amount: 12_000_000,
    requesterName: 'Lan Phạm', requesterId: 'private-user-id', refId: 'private-ref',
    payload: '{"bankAccount":"secret"}', status: 'pending', createdAt: '2026-08-01T01:00:00.000Z',
    steps: JSON.stringify([{ role: 'ACCOUNTANT', label: 'Kế toán', status: 'pending', userId: 'private-reviewer' }]),
    ...overrides,
  };
}

test('CEO13 target feed exports an allowlisted decision projection only', () => {
  const feed = buildLocalCeoDecisionFeed({ entity: { id: 'egoric' }, currency: 'VND', approvals: [approval()], asOf: now });
  assert.equal(feed.contract, 'repositoryrealms.ceo.decision-feed');
  assert.deepEqual(feed.items[0].currentStep, { role: 'ACCOUNTANT', label: 'Kế toán' });
  assert.equal(feed.items[0].recordPath, '/approvals?focus=ap-1&from=ceo-terminal');
  const serialized = JSON.stringify(feed);
  for (const secret of ['private-user-id', 'private-ref', 'private-reviewer', 'bankAccount', 'secret']) {
    assert.equal(serialized.includes(secret), false, `${secret} must not leave the entity`);
  }
  assert.deepEqual(feed.privacy, { containsPayload: false, containsReferenceIds: false, containsDecisionHistory: false });
});

test('CEO13 feed validation binds responses to the registered entity', () => {
  const feed = buildLocalCeoDecisionFeed({ entity: { id: 'egoric' }, approvals: [approval()], asOf: now });
  assert.throws(() => sanitizeCeoDecisionFeed(feed, { id: 'aim' }, now), /audience mismatch/i);
  assert.equal(sanitizeCeoDecisionFeed(feed, { id: 'egoric' }, now).items.length, 1);
});

test('CEO13 queue ranks SLA deterministically and never combines currencies', () => {
  const feeds = [
    buildLocalCeoDecisionFeed({ entity: { id: 'egoric' }, currency: 'VND', approvals: [approval()], asOf: now }),
    buildLocalCeoDecisionFeed({ entity: { id: 'aim' }, currency: 'USD', approvals: [approval({ id: 'ap-2', amount: 250, createdAt: '2026-08-01T11:00:00.000Z' })], asOf: now }),
  ];
  const queue = buildCeoUnifiedDecisionQueue({
    feeds, errors: [{ entityId: 'vnecom', code: 'timeout' }], now,
    registryEntities: [
      { id: 'egoric', displayName: 'Egoric Agency', enabled: true },
      { id: 'aim', displayName: 'AIm Agency', enabled: true },
      { id: 'vnecom', displayName: 'Vnecom LLC', enabled: true },
    ],
  });
  assert.equal(queue.items[0].id, 'ap-1');
  assert.equal(queue.items[0].urgency, 'critical');
  assert.equal(queue.sources.find((source) => source.entityId === 'vnecom').state, 'degraded');
  assert.deepEqual(queue.metrics.amountByCurrency, [{ currency: 'VND', value: 12_000_000 }, { currency: 'USD', value: 250 }]);
  assert.equal(queue.invariants.amountsCombinedAcrossCurrencies, false);
  assert.equal(queue.invariants.decisionsExecutedInOwningEntity, true);
});

test('CEO14 briefing places critical decisions before today/watch without inventing facts', () => {
  const decisionQueue = buildCeoUnifiedDecisionQueue({
    feeds: [buildLocalCeoDecisionFeed({ entity: { id: 'egoric' }, approvals: [approval()], asOf: now })],
    registryEntities: [{ id: 'egoric', displayName: 'Egoric Agency', enabled: true }], now,
  });
  const briefing = buildCeoDailyBriefing({
    decisionQueue,
    cockpit: {
      metrics: { sourcesAvailable: 1, sourcesRegistered: 1, openReceipts: 2 },
      attention: [{ code: 'command.receipt_pending', severity: 'warning', count: 2, href: '/ceo-commands', entityIds: ['egoric'] }],
    },
    dashboard: { portfolio: { delivery: { tasksOverdue: 3, projectsLate: 1 }, support: { slaBreaches: 0 } } },
    now,
  });
  assert.equal(briefing.state, 'critical');
  assert.equal(briefing.sections.now[0].code, 'decision.sla_critical');
  assert.ok(briefing.sections.today.some((entry) => entry.code === 'delivery.tasks_overdue'));
  assert.equal(briefing.invariants.aiDecisionMaking, false);
  assert.equal(briefing.invariants.inventedFacts, false);
  assert.equal(briefing.invariants.directEntityDatabaseWrites, false);
});

test('CEO13 service scope and read-only rollout capability are least-privilege wired', () => {
  assert.equal(CEO_SERVICE_SCOPES.DECISIONS_READ, 'ceo.decisions.read');
  assert.ok(CEO_ROLLOUT_RING_DEFINITIONS.read_only.capabilities.includes('decisions.read'));
  assert.equal(CEO_ROLLOUT_RING_DEFINITIONS.local_staging.capabilities.includes('decisions.read'), false);
});

test('CEO13/14 UI exposes no direct approve, reject, or entity write action', () => {
  const decisions = fs.readFileSync(new URL('../app/(app)/ceo-decisions/page.jsx', import.meta.url), 'utf8');
  const briefing = fs.readFileSync(new URL('../app/(app)/ceo-briefing/page.jsx', import.meta.url), 'utf8');
  assert.equal(/\/api\/approvals\/.+decide/.test(decisions), false);
  assert.equal(/method:\s*'POST'.*\/api\/approvals/s.test(`${decisions}\n${briefing}`), false);
  assert.equal(/>\s*(Approve|Reject|Duyệt|Từ chối)\s*</i.test(`${decisions}\n${briefing}`), false);
  assert.match(decisions, /\/api\/ceo\/v1\/sso\/authorize/);
  assert.match(briefing, /buildCeoDailyBriefing/);
});
