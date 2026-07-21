export const REALM_PHASE25_MINIMUM_PILOT_DAYS = 7;

function passed(value) {
  return value === true;
}

function phase(id, label, status, detail) {
  return { id, label, status, detail };
}

export function buildRealmPhase25Acceptance(evidence = {}) {
  const stagingPassed = passed(evidence.staging?.isolated)
    && passed(evidence.staging?.migrationReady)
    && passed(evidence.staging?.backupVerified)
    && Number(evidence.staging?.directors || 0) >= 2;
  const identityPassed = passed(evidence.identity?.sameSession)
    && passed(evidence.identity?.rbacMatrixPassed)
    && passed(evidence.identity?.erpDefault);
  const uatPassed = passed(evidence.uat?.businessFlowsPassed)
    && passed(evidence.uat?.repositoryRealmsReceipts)
    && passed(evidence.uat?.crossSurfaceSync);
  const rehearsalPassed = evidence.rehearsal?.status === 'sealed'
    && passed(evidence.rehearsal?.makerChecker)
    && passed(evidence.rehearsal?.allScenariosPassed);
  const hardeningPassed = passed(evidence.hardening?.regression)
    && passed(evidence.hardening?.security)
    && passed(evidence.hardening?.chaos)
    && passed(evidence.hardening?.performance)
    && passed(evidence.hardening?.restoreReadiness);
  const pilotActive = evidence.pilot?.status === 'active';
  const observedDays = Math.max(0, Number(evidence.pilot?.observedDays || 0));
  const minimumObserved = observedDays >= REALM_PHASE25_MINIMUM_PILOT_DAYS;
  const pilotStatus = !pilotActive ? 'blocked' : minimumObserved ? 'passed' : 'collecting';

  const blockers = [];
  if (!stagingPassed) blockers.push('staging');
  if (!identityPassed) blockers.push('identity');
  if (!uatPassed) blockers.push('uat');
  if (!rehearsalPassed) blockers.push('rehearsal');
  if (!hardeningPassed) blockers.push('hardening');
  if (!pilotActive) blockers.push('pilot_not_active');
  if (Number(evidence.pilot?.criticalIncidents || 0) > 0) blockers.push('critical_incident');
  if (Number(evidence.pilot?.blockedFeedback || 0) > 0) blockers.push('blocked_feedback');

  let recommendation = 'hold';
  if (blockers.includes('critical_incident') || blockers.includes('blocked_feedback')) recommendation = 'no_go';
  else if (blockers.length === 0 && minimumObserved && evidence.pilot?.goNoGo === 'go') recommendation = 'go';
  else if (minimumObserved && evidence.pilot?.goNoGo === 'no_go') recommendation = 'no_go';

  return {
    schemaVersion: 1,
    recommendation,
    label: recommendation === 'go' ? 'GO' : recommendation === 'no_go' ? 'NO-GO' : 'HOLD',
    phases: [
      phase('staging', '1. Staging database', stagingPassed ? 'passed' : 'blocked', stagingPassed ? 'Isolated, migrated, backed up and maker-checker ready.' : 'Staging evidence is incomplete.'),
      phase('identity', '2. SSO and RBAC', identityPassed ? 'passed' : 'blocked', identityPassed ? 'Shared session, role matrix and ERP-default policy passed.' : 'Identity or authorization evidence is incomplete.'),
      phase('uat', '3. Business-flow UAT', uatPassed ? 'passed' : 'blocked', uatPassed ? 'Canonical rules, receipts and cross-surface sync passed.' : 'Business-flow evidence is incomplete.'),
      phase('rehearsal', '4. Demo rehearsal', rehearsalPassed ? 'passed' : 'blocked', rehearsalPassed ? 'All scenarios sealed by an independent Director.' : 'Rehearsal is not independently sealed.'),
      phase('hardening', '5. Release hardening', hardeningPassed ? 'passed' : 'blocked', hardeningPassed ? 'Regression, security, chaos, performance and restore readiness passed.' : 'Hardening evidence is incomplete.'),
      phase('pilot', '6. Measured pilot', pilotStatus, pilotActive ? `${observedDays}/${REALM_PHASE25_MINIMUM_PILOT_DAYS} minimum observation days.` : 'Pilot wave is not active.'),
      phase('decision', '7. Go / No-Go', recommendation === 'hold' ? 'collecting' : 'passed', `Fail-closed recommendation: ${recommendation.toUpperCase().replace('_', '-')}.`),
    ],
    observationWindow: {
      observedDays,
      minimumDays: REALM_PHASE25_MINIMUM_PILOT_DAYS,
      complete: minimumObserved,
    },
    blockers,
    governance: {
      failClosed: true,
      erpRemainsDefault: true,
      authoritativeSource: 'Realm Pilot Operations Go/No-Go',
      releaseCandidateDossierIsApproval: false,
      peopleScoring: false,
    },
  };
}
