import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRealmReleaseCandidateDossier } from '../lib/realm-release-candidate.js';

const NOW = new Date('2026-07-20T14:00:00.000Z');

function fixture() {
  return {
    operationsDashboard: {
      policy: {
        version: 7,
        mode: 'pilot',
        defaultSurface: 'erp',
        cohortStrategy: 'members',
        memberCount: 8,
        features: { office: true, tavern: true, feedback: true },
      },
      readiness: {
        status: 'ready',
        ready: true,
        summary: { passed: 8, total: 8, blockers: 0, advisories: 0, unresolvedFeedback: 0, blockedFeedback: 0, eligibleUsers: 8 },
        gates: [{ id: 'schema', passed: true, blocking: true }, { id: 'erp-fallback', passed: true, blocking: true }],
      },
      rehearsal: { readyForWave: true, rehearsalId: 'rehearsal-7', policyVersion: 7, sealedAt: '2026-07-20T12:00:00.000Z', expiresAt: '2026-07-21T12:00:00.000Z' },
      operations: {
        currentWave: {
          id: 'wave-7', status: 'completed', policyVersion: 7, rehearsalId: 'rehearsal-7',
          submittedAt: '2026-07-10T12:00:00.000Z', activatedAt: '2026-07-11T12:00:00.000Z', completedAt: '2026-07-19T12:00:00.000Z',
          submittedById: 'user-secret', submittedByName: 'Private Person',
        },
      },
      report: { available: true, recommendation: 'go', observedDays: 8, generatedAt: NOW.toISOString(), criteria: [{ id: 'observation-window', passed: true, detail: 'private free text' }] },
      activationGuard: { state: 'cleared', healthy: true, remainingMinutes: 0, criteria: [{ id: 'live-readiness', passed: true }] },
      incidentCommand: { state: 'stable', summary: { open: 0, monitoring: 0, criticalOpen: 0, rollbackTriggered: 0 }, timeline: [{ detail: 'private incident text' }] },
      launchApprovals: { pending: 0, timedOut: 0 },
      alerts: [],
      chaosReadiness: { posture: 'ready', summary: { protected: 7, contained: 0, critical: 0, total: 7 }, scenarios: [{ id: 'database-slow', state: 'protected', liveDetail: 'private diagnostic' }] },
    },
    experienceScorecard: {
      status: 'ready', ready: true, recommendedDecision: 'ready-for-approved-expansion', authoritativeLaunchGate: false,
      summary: { passed: 6, total: 6, blockers: 0, advisories: 0, observedJourneys: 4, totalEvents: 32, blockedFeedback: 0 },
      gates: [{ id: 'continuity-observed', passed: true, blocking: true, detail: 'private free text' }],
    },
  };
}

test('Phase 24 builds a complete privacy-safe Release Candidate dossier without becoming a launch gate', () => {
  const dossier = buildRealmReleaseCandidateDossier({ ...fixture(), generatedAt: NOW });
  assert.equal(dossier.status, 'complete');
  assert.equal(dossier.dossierComplete, true);
  assert.equal(dossier.sections.length, 5);
  assert.equal(dossier.authoritativeLaunchGate, false);
  assert.equal(dossier.advisoryOnly, true);
  assert.equal(dossier.authority.businessActionContract, 'RepositoryRealms');
  assert.equal(dossier.authority.receipts, 'required');
  assert.match(dossier.integrity.digest, /^[a-f0-9]{64}$/);
  assert.match(dossier.candidateId, /^rrc-v1-[a-f0-9]{12}$/);
  assert.deepEqual(dossier.sourceSignals, { readiness: 'ready', rehearsal: 'sealed', pilotOperations: 'go', chaos: 'ready', experience: 'ready' });
  const serialized = JSON.stringify(dossier);
  for (const privateValue of ['user-secret', 'Private Person', 'private free text', 'private incident text', 'private diagnostic']) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
});

test('Phase 24 digest ignores volatile generation time but changes when source evidence changes', () => {
  const first = buildRealmReleaseCandidateDossier({ ...fixture(), generatedAt: NOW });
  const later = buildRealmReleaseCandidateDossier({ ...fixture(), generatedAt: new Date('2026-07-20T15:00:00.000Z') });
  assert.equal(first.integrity.digest, later.integrity.digest);
  assert.equal(first.candidateId, later.candidateId);
  assert.notEqual(first.generatedAt, later.generatedAt);

  const changed = fixture();
  changed.operationsDashboard.readiness.ready = false;
  changed.operationsDashboard.readiness.status = 'blocked';
  assert.notEqual(buildRealmReleaseCandidateDossier({ ...changed, generatedAt: NOW }).integrity.digest, first.integrity.digest);
});

test('Phase 24 reports evidence completeness without inventing a go/no-go decision', () => {
  const dossier = buildRealmReleaseCandidateDossier({ generatedAt: NOW });
  assert.equal(dossier.status, 'incomplete');
  assert.equal(dossier.dossierComplete, false);
  assert.deepEqual(dossier.missingSections, ['readiness', 'rehearsal', 'pilot-operations', 'chaos', 'experience']);
  assert.equal('recommendedDecision' in dossier, false);
  assert.equal('approved' in dossier, false);
});
