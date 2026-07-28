import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateRealmLaunchReadiness,
  loadRealmLaunchReadiness,
} from '../lib/realm-readiness.js';

const READY_POLICY = {
  mode: 'pilot',
  defaultSurface: 'erp',
  roles: ['STAFF'],
  features: { office: true, tavern: true, feedback: true },
  onboardingVersion: 2,
  version: 4,
};

const READY_SCHEMA = { ready: true, missing: [], schemaVersion: 8 };
const READY_METRICS = {
  eligibleUsers: 2,
  preferences: { auto: 1, erp: 1, realm: 0 },
  online: { total: 1, erp: 1, realm: 0 },
  privacy: { aggregateOnly: true, performanceTracking: false, durationTracking: false },
};

test('Phase 12 preflight is ready only when every blocking launch gate passes', () => {
  const result = evaluateRealmLaunchReadiness({
    policy: READY_POLICY,
    schema: READY_SCHEMA,
    metrics: READY_METRICS,
    unresolvedFeedback: 1,
    blockedFeedback: 0,
  });
  assert.equal(result.ready, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.summary.blockers, 0);
  assert.equal(result.summary.passed, result.summary.total);
  assert.deepEqual(result.rollback, {
    action: 'set-policy-mode-off',
    fallbackRoute: '/dashboard',
    preservesErpData: true,
    reversesMigrations: false,
  });
});

test('Phase 12 preflight blocks an unsafe broad rollout and keeps personal tracking disabled', () => {
  const result = evaluateRealmLaunchReadiness({
    policy: {
      ...READY_POLICY,
      mode: 'open',
      defaultSurface: 'realm',
      features: { office: false, tavern: false, feedback: false },
    },
    schema: { ready: false, missing: ['pilot_feedback'], schemaVersion: 8 },
    metrics: { ...READY_METRICS, eligibleUsers: 0 },
    unresolvedFeedback: 3,
    blockedFeedback: 1,
  });
  assert.equal(result.ready, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.summary.blockers, 7);
  assert.equal(result.privacy.aggregateOnly, true);
  assert.equal(result.privacy.performanceTracking, false);
  assert.equal(result.privacy.durationTracking, false);
  assert.equal(JSON.stringify(result).includes('userId'), false);
  assert.equal(JSON.stringify(result).includes('name'), false);
});

test('Phase 12 allows Office-only pilot while Tavern remains an advisory', () => {
  const result = evaluateRealmLaunchReadiness({
    policy: { ...READY_POLICY, features: { ...READY_POLICY.features, tavern: false } },
    schema: READY_SCHEMA,
    metrics: READY_METRICS,
  });
  assert.equal(result.ready, true);
  assert.equal(result.status, 'attention');
  assert.equal(result.summary.blockers, 0);
  assert.equal(result.summary.advisories, 1);
});

test('Phase 12 loads only aggregate cohort, presence and Guild Support counts', async () => {
  const rawRows = [
    [{
      userTable: true,
      collaborationTable: true,
      changeFeedTable: true,
      actionReceiptTable: true,
      pilotPreferenceColumn: true,
      pilotFeedbackColumns: true,
      migrationTable: true,
    }],
    [{ applied: true }],
  ];
  const ticketQueries = [];
  const db = {
    $queryRaw: async () => rawRows.shift(),
    user: {
      findMany: async () => [
        { id: 'staff-1', role: 'STAFF', roles: ['STAFF'], userType: 'employee', workspacePreference: 'auto' },
        { id: 'director-1', role: 'DIRECTOR', roles: ['DIRECTOR'], userType: 'employee', workspacePreference: 'erp' },
      ],
    },
    collaborationPresenceSession: {
      findMany: async () => [{ userId: 'staff-1', surface: 'erp' }],
    },
    ticket: {
      count: async (query) => {
        ticketQueries.push(query);
        return ticketQueries.length === 1 ? 2 : 0;
      },
    },
  };
  const result = await loadRealmLaunchReadiness(db, READY_POLICY, new Date('2026-07-19T12:00:00.000Z'));
  assert.equal(result.ready, true);
  assert.equal(result.policyVersion, 4);
  assert.equal(result.onboardingVersion, 2);
  assert.equal(result.metrics.eligibleUsers, 1);
  assert.equal(result.metrics.online.total, 1);
  assert.equal(result.summary.unresolvedFeedback, 2);
  assert.equal(ticketQueries.length, 2);
  assert.deepEqual(ticketQueries[0].where.status.notIn, ['resolved', 'closed']);
  assert.equal(ticketQueries[1].where.feedbackContext.contains, '"impact":"blocked"');
  const payload = JSON.stringify(result);
  assert.equal(payload.includes('staff-1'), false);
  assert.equal(payload.includes('director-1'), false);
});
