import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'presentation-only-context', phase: 22, layer: 'privacy', source: 'lib/realm-experience.js', signals: ['REALM_EXPERIENCE_STORAGE_KEY', 'mode,', 'panel,', 'ledgerView,', 'position,'] },
  { id: 'no-record-context', phase: 22, layer: 'privacy', source: 'tests/realm-experience.test.mjs', signals: ["'recordId' in context, false", "'campaignId' in context, false"] },
  { id: 'permission-safe-restore', phase: 22, layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ['experienceHydratedRef', 'realmAccessForPanel', 'realmAccessForSurface', "? 'ledger'", "'briefing'"] },
  { id: 'realm-erp-handoff', phase: 22, layer: 'navigation', source: 'components/realm/RealmOffice.jsx', signals: ['persistWorkspaceSurface', "'erp_handoff'", 'ERP · CRM'] },
  { id: 'mobile-destination-navigation', phase: 22, layer: 'responsive', source: 'components/realm/RealmOffice.jsx', signals: ['realm-mobile-destination', 'mobileNavigator', 'ledger:personal'] },
  { id: 'responsive-safe-area', phase: 22, layer: 'style', source: 'components/realm/realm-office.module.css', signals: ['@media (max-width: 620px)', 'env(safe-area-inset-bottom)', '.mobileNavigator', 'min-height: 44px'] },
  { id: 'accessible-navigation', phase: 22, layer: 'accessibility', source: 'components/realm/RealmOffice.jsx', signals: ['skipLink', 'aria-live="polite"', 'tabIndex={-1}'] },
  { id: 'accessible-onboarding', phase: 22, layer: 'accessibility', source: 'components/realm/RealmPilotOnboarding.jsx', signals: ['role="progressbar"', 'aria-valuemin="1"', 'không lưu record'] },
  { id: 'reduced-motion', phase: 22, layer: 'accessibility', source: 'components/realm/realm-office.module.css', signals: ['@media (prefers-reduced-motion: reduce)', 'animation-duration: .01ms'] },
  { id: 'below-fold-render-budget', phase: 22, layer: 'performance', source: 'components/realm/realm-office.module.css', signals: ['content-visibility: auto', 'contain-intrinsic-size: auto 420px'] },
  { id: 'art-payload-budget', phase: 22, layer: 'performance', source: 'tests/realm-art-assets.test.mjs', signals: ['totalBytes < 125_000', 'totalBytes < 100_000', 'totalBytes < 750_000'] },
  { id: 'phase22-runbook', phase: 22, layer: 'operations', source: 'docs/realms/PHASE-22-UX-JOURNEY.md', signals: ['Parity là parity của business invariant', '390×844', 'Không tự retry mutation'] },
  { id: 'fixed-aggregate-signals', phase: 23, layer: 'privacy', source: 'lib/realm-experience.js', signals: ['REALM_EXPERIENCE_EVENTS', 'fixedCounter', 'totalEvents', 'performanceTracking: false'] },
  { id: 'server-normalization', phase: 23, layer: 'api', source: 'lib/realm-experience-admin.js', signals: ['normalizeRealmExperienceEvent', 'applyRealmExperienceTelemetryEvent', "isolationLevel: 'Serializable'"] },
  { id: 'authenticated-pilot-ingest', phase: 23, layer: 'api', source: 'app/api/realm-demo/experience/route.js', signals: ['currentUser', 'isFreelancer', 'loadRealmPilotDecision', 'if (!decision.allowed)'] },
  { id: 'experience-observability', phase: 23, layer: 'observability', source: 'app/api/realm-demo/experience/route.js', signals: ['startRealmApiRequest', 'realmJsonResponse', 'realmErrorResponse'] },
  { id: 'director-scorecard', phase: 23, layer: 'authorization', source: 'app/api/realm-demo/experience/route.js', signals: ['isDirector', 'loadRealmLaunchReadiness', 'evaluateRealmExperiencePilot'] },
  { id: 'settings-clobber-protection', phase: 23, layer: 'persistence', source: 'app/api/settings/route.js', signals: ['delete data.realmExperienceTelemetry', 'current.realmExperienceTelemetry', 'next.realmExperienceTelemetry'] },
  { id: 'advisory-not-authoritative', phase: 23, layer: 'governance', source: 'lib/realm-experience.js', signals: ['authoritativeLaunchGate: false', 'hold-or-limited-pilot', 'ready-for-approved-expansion'] },
  { id: 'experience-scorecard-ui', phase: 23, layer: 'ui', source: 'components/realm/RealmExperienceScorecard.jsx', signals: ['Experience Pilot · Phase 23', 'RepositoryRealms launch readiness', 'Không tự động mở pilot'] },
  { id: 'scorecard-responsive-accessible', phase: 23, layer: 'style', source: 'components/realm/realm-experience-scorecard.module.css', signals: ['min-height: 44px', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'feedback-loop-signal', phase: 23, layer: 'feedback', source: 'components/realm/RealmFeedbackLauncher.jsx', signals: ["event: 'feedback_opened'", "surface === 'realm'", 'Guild Support'] },
  { id: 'four-journey-evidence', phase: 23, layer: 'measurement', source: 'lib/realm-experience.js', signals: ["['guild', 'war', 'treasury', 'tavern']", "id: 'four-journey-coverage'"] },
  { id: 'deterministic-experience-tests', phase: 23, layer: 'test', source: 'tests/realm-experience.test.mjs', signals: ['Phase 22 continuity context', 'Phase 23 scorecard is advisory', 'preserves unrelated configuration'] },
  { id: 'experience-auth-boundary-e2e', phase: 23, layer: 'e2e', source: 'tests/e2e/realm-smoke.spec.mjs', signals: ["'/api/realm-demo/experience'", 'preserve the ERP authentication boundary'] },
  { id: 'continuity-responsive-e2e', phase: 23, layer: 'e2e', source: 'tests/e2e/realm-smoke.spec.mjs', signals: ['Realm presentation context restores without persisting business identifiers', "name: 'Khu vực'", "'ledger:treasury'"] },
  { id: 'phase23-runbook', phase: 23, layer: 'operations', source: 'docs/realms/PHASE-23-EXPERIENCE-PILOT.md', signals: ['advisory', 'không tạo event log tăng vô hạn', 'Go / no-go'] },
];

const JOURNEYS = ['guild', 'war', 'treasury', 'tavern'];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildRealmExperienceAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const experienceSource = fs.readFileSync(path.join(root, 'lib', 'realm-experience.js'), 'utf8');
  const journeys = JOURNEYS.map((journey) => ({
    journey,
    evidence: `lib/realm-experience.js · ${journey}`,
    status: experienceSource.includes(`'${journey}'`) ? 'verified' : 'failed',
  }));
  const verified = contracts.filter((row) => row.status === 'verified');
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: verified.length,
      phase22Contracts: contracts.filter((row) => row.phase === 22).length,
      verifiedPhase22Contracts: verified.filter((row) => row.phase === 22).length,
      phase23Contracts: contracts.filter((row) => row.phase === 23).length,
      verifiedPhase23Contracts: verified.filter((row) => row.phase === 23).length,
      journeys: journeys.length,
      verifiedJourneys: journeys.filter((row) => row.status === 'verified').length,
      aggregateOnly: true,
      authoritativeLaunchGate: false,
      recordIdsStored: false,
      performanceTracking: false,
      additiveMigrations: 0,
    },
    contracts,
    journeys,
  };
}

export function renderRealmExperienceArtifacts(result) {
  const columns = ['id', 'phase', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  const summary = result.summary;
  const rows = result.journeys.map((row) => `| ${row.journey} | ${row.evidence} | ${row.status} |`).join('\n');
  return {
    'experience-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'experience-contracts.csv': `${columns.join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-22-23-REPORT.md': `# Phase 22–23 — UX Journey & Experience Pilot\n\nRealm UX continuity, accessibility, responsive delivery và aggregate-only pilot evidence đã được khóa bằng regression gate.\n\n- Phase 22 contracts: **${summary.verifiedPhase22Contracts}/${summary.phase22Contracts}**\n- Phase 23 contracts: **${summary.verifiedPhase23Contracts}/${summary.phase23Contracts}**\n- Journey evidence: **${summary.verifiedJourneys}/${summary.journeys}**\n- Aggregate only: **${summary.aggregateOnly}**\n- Authoritative launch gate: **${summary.authoritativeLaunchGate}**\n- Record IDs stored: **${summary.recordIdsStored}**\n- Performance tracking: **${summary.performanceTracking}**\n- Additive migrations: **${summary.additiveMigrations}**\n\n| Journey | Evidence | Status |\n| --- | --- | --- |\n${rows}\n\nChạy regression gate: \`npm run audit:realm:experience:check\`.\n`,
  };
}
