import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRealmPhase25Acceptance } from '../lib/realm-phase25-acceptance.js';

function evidence(overrides = {}) {
  return {
    staging: { isolated: true, migrationReady: true, backupVerified: true, directors: 2 },
    identity: { sameSession: true, rbacMatrixPassed: true, erpDefault: true },
    uat: { businessFlowsPassed: true, repositoryRealmsReceipts: true, crossSurfaceSync: true },
    rehearsal: { status: 'sealed', makerChecker: true, allScenariosPassed: true },
    hardening: { regression: true, security: true, chaos: true, performance: true, restoreReadiness: true },
    pilot: { status: 'active', observedDays: 0, criticalIncidents: 0, blockedFeedback: 0, goNoGo: 'hold' },
    ...overrides,
  };
}

test('Phase 25 remains HOLD while a real seven-day observation window is collecting', () => {
  const result = buildRealmPhase25Acceptance(evidence());
  assert.equal(result.recommendation, 'hold');
  assert.equal(result.observationWindow.complete, false);
  assert.equal(result.phases.length, 7);
  assert.equal(result.phases[5].status, 'collecting');
  assert.equal(result.governance.erpRemainsDefault, true);
});

test('Phase 25 can return GO only after minimum observation and canonical pilot decision', () => {
  const result = buildRealmPhase25Acceptance(evidence({
    pilot: { status: 'active', observedDays: 8, criticalIncidents: 0, blockedFeedback: 0, goNoGo: 'go' },
  }));
  assert.equal(result.recommendation, 'go');
  assert.equal(result.blockers.length, 0);
});

test('Phase 25 fails closed to NO-GO on a critical pilot incident', () => {
  const result = buildRealmPhase25Acceptance(evidence({
    pilot: { status: 'active', observedDays: 1, criticalIncidents: 1, blockedFeedback: 0, goNoGo: 'hold' },
  }));
  assert.equal(result.recommendation, 'no_go');
  assert.equal(result.blockers.includes('critical_incident'), true);
});

test('Phase 25 cannot mask incomplete UAT behind a pilot recommendation', () => {
  const result = buildRealmPhase25Acceptance(evidence({
    uat: { businessFlowsPassed: false, repositoryRealmsReceipts: true, crossSurfaceSync: true },
    pilot: { status: 'active', observedDays: 9, criticalIncidents: 0, blockedFeedback: 0, goNoGo: 'go' },
  }));
  assert.equal(result.recommendation, 'hold');
  assert.equal(result.blockers.includes('uat'), true);
});
