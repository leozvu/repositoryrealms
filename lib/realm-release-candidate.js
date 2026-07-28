import { createHash } from 'node:crypto';

export const REALM_RELEASE_CANDIDATE_SCHEMA_VERSION = 1;
export const REALM_RELEASE_CANDIDATE_DIGEST_ALGORITHM = 'sha256';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function digestValue(value) {
  return createHash(REALM_RELEASE_CANDIDATE_DIGEST_ALGORITHM)
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function text(value, fallback = null) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function compactGates(gates) {
  return Array.isArray(gates) ? gates.map((gate) => ({
    id: text(gate?.id, 'unknown'),
    passed: gate?.passed === true,
    blocking: gate?.blocking === true,
  })) : [];
}

function compactCriteria(criteria) {
  return Array.isArray(criteria) ? criteria.map((criterion) => ({
    id: text(criterion?.id, 'unknown'),
    passed: criterion?.passed === true,
  })) : [];
}

function section(id, label, source, state, present, evidence) {
  return { id, label, source, state, present, evidence };
}

function privacySafeEvidence(operations, experience) {
  const readiness = operations?.readiness || null;
  const rehearsal = operations?.rehearsal || null;
  const wave = operations?.operations?.currentWave || null;
  const report = operations?.report || null;
  const incident = operations?.incidentCommand || null;
  const activation = operations?.activationGuard || null;
  const chaos = operations?.chaosReadiness || null;
  const policy = operations?.policy || null;

  return {
    authority: {
      businessActionContract: 'RepositoryRealms',
      authorization: 'shared',
      businessRules: 'shared',
      receipts: 'required',
      audit: 'atomic',
      launchWorkflow: 'Controlled Launch',
      authoritativeLaunchGate: false,
    },
    policy: policy ? {
      version: count(policy.version),
      mode: text(policy.mode, 'unknown'),
      defaultSurface: text(policy.defaultSurface, 'erp'),
      cohortStrategy: text(policy.cohortStrategy, 'unknown'),
      memberCount: count(policy.memberCount),
      features: {
        office: policy.features?.office === true,
        tavern: policy.features?.tavern === true,
        feedback: policy.features?.feedback === true,
      },
    } : null,
    readiness: readiness ? {
      status: text(readiness.status, 'unknown'),
      ready: readiness.ready === true,
      summary: {
        passed: count(readiness.summary?.passed),
        total: count(readiness.summary?.total),
        blockers: count(readiness.summary?.blockers),
        advisories: count(readiness.summary?.advisories),
        unresolvedFeedback: count(readiness.summary?.unresolvedFeedback),
        blockedFeedback: count(readiness.summary?.blockedFeedback),
        eligibleUsers: count(readiness.summary?.eligibleUsers),
      },
      gates: compactGates(readiness.gates),
    } : null,
    rehearsal: rehearsal ? {
      readyForWave: rehearsal.readyForWave === true,
      rehearsalId: text(rehearsal.rehearsalId),
      policyVersion: count(rehearsal.policyVersion),
      sealedAt: text(rehearsal.sealedAt),
      expiresAt: text(rehearsal.expiresAt),
    } : null,
    operations: operations ? {
      wave: wave ? {
        id: text(wave.id),
        status: text(wave.status, 'unknown'),
        policyVersion: count(wave.policyVersion),
        rehearsalId: text(wave.rehearsalId),
        submittedAt: text(wave.submittedAt),
        activatedAt: text(wave.activatedAt),
        completedAt: text(wave.completedAt),
      } : null,
      report: report ? {
        available: report.available === true,
        recommendation: text(report.recommendation, 'hold'),
        observedDays: count(report.observedDays),
        criteria: compactCriteria(report.criteria),
      } : null,
      activation: activation ? {
        state: text(activation.state, 'unknown'),
        healthy: activation.healthy === true,
        criteria: compactCriteria(activation.criteria),
      } : null,
      incidents: incident ? {
        state: text(incident.state, 'unknown'),
        open: count(incident.summary?.open),
        monitoring: count(incident.summary?.monitoring),
        criticalOpen: count(incident.summary?.criticalOpen),
        rollbackTriggered: count(incident.summary?.rollbackTriggered),
      } : null,
      launchApprovals: {
        pending: count(operations?.launchApprovals?.pending),
        timedOut: count(operations?.launchApprovals?.timedOut),
      },
      alerts: {
        total: Array.isArray(operations?.alerts) ? operations.alerts.length : 0,
        critical: Array.isArray(operations?.alerts) ? operations.alerts.filter((alert) => alert?.severity === 'critical').length : 0,
        warning: Array.isArray(operations?.alerts) ? operations.alerts.filter((alert) => alert?.severity === 'warning').length : 0,
      },
    } : null,
    chaos: chaos ? {
      posture: text(chaos.posture, 'unknown'),
      summary: {
        protected: count(chaos.summary?.protected),
        contained: count(chaos.summary?.contained),
        critical: count(chaos.summary?.critical),
        total: count(chaos.summary?.total),
      },
      scenarios: Array.isArray(chaos.scenarios) ? chaos.scenarios.map((scenario) => ({
        id: text(scenario?.id, 'unknown'),
        state: text(scenario?.state, 'unknown'),
      })) : [],
    } : null,
    experience: experience ? {
      status: text(experience.status, 'insufficient-data'),
      ready: experience.ready === true,
      recommendedDecision: text(experience.recommendedDecision, 'hold-or-limited-pilot'),
      summary: {
        passed: count(experience.summary?.passed),
        total: count(experience.summary?.total),
        blockers: count(experience.summary?.blockers),
        advisories: count(experience.summary?.advisories),
        observedJourneys: count(experience.summary?.observedJourneys),
        totalEvents: count(experience.summary?.totalEvents),
        blockedFeedback: count(experience.summary?.blockedFeedback),
      },
      gates: compactGates(experience.gates),
    } : null,
  };
}

export function buildRealmReleaseCandidateDossier({
  operationsDashboard = null,
  experienceScorecard = null,
  generatedAt = new Date(),
} = {}) {
  const evidence = privacySafeEvidence(operationsDashboard, experienceScorecard);
  const sections = [
    section('readiness', 'RepositoryRealms readiness', 'Live release readiness', evidence.readiness?.status || 'missing', Boolean(evidence.readiness), evidence.readiness),
    section('rehearsal', 'Sealed launch rehearsal', 'Maker–checker rehearsal', evidence.rehearsal?.readyForWave ? 'sealed' : evidence.rehearsal ? 'not-sealed' : 'missing', Boolean(evidence.rehearsal), evidence.rehearsal),
    section('pilot-operations', 'Pilot operations', 'Wave, incident và go/no-go report', evidence.operations?.report?.recommendation || (evidence.operations ? 'hold' : 'missing'), Boolean(evidence.operations), evidence.operations),
    section('chaos', 'Chaos resilience', 'Graceful degradation contracts', evidence.chaos?.posture || 'missing', Boolean(evidence.chaos), evidence.chaos),
    section('experience', 'Experience evidence', 'Aggregate-only UX scorecard', evidence.experience?.status || 'missing', Boolean(evidence.experience), evidence.experience),
  ];
  const missingSections = sections.filter((item) => !item.present).map((item) => item.id);
  const canonical = {
    schemaVersion: REALM_RELEASE_CANDIDATE_SCHEMA_VERSION,
    authority: evidence.authority,
    policy: evidence.policy,
    sections: sections.map(({ id, state, present, evidence: sectionEvidence }) => ({ id, state, present, evidence: sectionEvidence })),
  };
  const digest = digestValue(canonical);

  return {
    schemaVersion: REALM_RELEASE_CANDIDATE_SCHEMA_VERSION,
    candidateId: `rrc-v${REALM_RELEASE_CANDIDATE_SCHEMA_VERSION}-${digest.slice(0, 12)}`,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString(),
    status: missingSections.length ? 'incomplete' : 'complete',
    dossierComplete: missingSections.length === 0,
    missingSections,
    authoritativeLaunchGate: false,
    advisoryOnly: true,
    authority: evidence.authority,
    policy: evidence.policy,
    sections,
    sourceSignals: {
      readiness: evidence.readiness?.status || 'missing',
      rehearsal: evidence.rehearsal?.readyForWave ? 'sealed' : evidence.rehearsal ? 'not-sealed' : 'missing',
      pilotOperations: evidence.operations?.report?.recommendation || 'hold',
      chaos: evidence.chaos?.posture || 'missing',
      experience: evidence.experience?.status || 'missing',
    },
    integrity: {
      algorithm: REALM_RELEASE_CANDIDATE_DIGEST_ALGORITHM,
      digest,
      canonicalSchema: `realm-release-candidate-v${REALM_RELEASE_CANDIDATE_SCHEMA_VERSION}`,
      excludesVolatileGenerationTime: true,
    },
    privacy: {
      aggregateOnly: true,
      rosterIncluded: false,
      userIdsIncluded: false,
      businessRecordIdsIncluded: false,
      contentIncluded: false,
      performanceTracking: false,
      durationTracking: false,
    },
  };
}
