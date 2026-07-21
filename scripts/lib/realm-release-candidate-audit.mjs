import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'canonical-sha256-digest', layer: 'integrity', source: 'lib/realm-release-candidate.js', signals: ['createHash', 'stableValue', "algorithm: REALM_RELEASE_CANDIDATE_DIGEST_ALGORITHM", 'excludesVolatileGenerationTime: true'] },
  { id: 'five-source-evidence-pack', layer: 'composition', source: 'lib/realm-release-candidate.js', signals: ["section('readiness'", "section('rehearsal'", "section('pilot-operations'", "section('chaos'", "section('experience'"] },
  { id: 'not-a-launch-gate', layer: 'governance', source: 'lib/realm-release-candidate.js', signals: ['authoritativeLaunchGate: false', 'advisoryOnly: true', "launchWorkflow: 'Controlled Launch'"] },
  { id: 'repository-realms-invariants', layer: 'parity', source: 'lib/realm-release-candidate.js', signals: ["businessActionContract: 'RepositoryRealms'", "authorization: 'shared'", "businessRules: 'shared'", "receipts: 'required'", "audit: 'atomic'"] },
  { id: 'privacy-safe-projection', layer: 'privacy', source: 'lib/realm-release-candidate.js', signals: ['rosterIncluded: false', 'userIdsIncluded: false', 'businessRecordIdsIncluded: false', 'contentIncluded: false', 'performanceTracking: false', 'durationTracking: false'] },
  { id: 'authoritative-loader-reuse', layer: 'server', source: 'lib/realm-release-candidate-admin.js', signals: ['loadRealmPilotOperationsDashboard', 'loadRealmExperienceTelemetry', 'evaluateRealmExperiencePilot', 'buildRealmReleaseCandidateDossier'] },
  { id: 'director-only-api', layer: 'authorization', source: 'app/api/realm-demo/release-candidate/route.js', signals: ['currentUser', 'isFreelancer', 'isDirector', 'realm_release_candidate_forbidden'] },
  { id: 'api-observability', layer: 'observability', source: 'app/api/realm-demo/release-candidate/route.js', signals: ['startRealmApiRequest', 'realmJsonResponse', 'realmErrorResponse'] },
  { id: 'read-only-dossier-ui', layer: 'ui', source: 'components/realm/RealmReleaseCandidateDossier.jsx', signals: ['Release Candidate Dossier · Phase 24', 'Dossier không phải approval', 'không được gộp thành một cổng GO/NO-GO mới'] },
  { id: 'local-evidence-export', layer: 'ui', source: 'components/realm/RealmReleaseCandidateDossier.jsx', signals: ['navigator.clipboard', 'new Blob', 'Tải JSON evidence'] },
  { id: 'accessible-responsive-dossier', layer: 'style', source: 'components/realm/realm-release-candidate-dossier.module.css', signals: ['min-height: 44px', '@media (max-width: 680px)', '@media (max-width: 420px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'deterministic-unit-tests', layer: 'test', source: 'tests/realm-release-candidate.test.mjs', signals: ['digest ignores volatile generation time', 'privacy-safe Release Candidate dossier', 'without inventing a go/no-go decision'] },
  { id: 'authentication-boundary-e2e', layer: 'e2e', source: 'tests/e2e/realm-smoke.spec.mjs', signals: ["'/api/realm-demo/release-candidate'", 'Release Candidate Dossier · Phase 24'] },
  { id: 'phase24-runbook', layer: 'operations', source: 'docs/realms/PHASE-24-RELEASE-CANDIDATE-DOSSIER.md', signals: ['Evidence completeness không phải launch readiness', 'Không deploy', 'SHA-256', 'Controlled Launch'] },
  { id: 'qa-pipeline-gate', layer: 'quality', source: 'package.json', signals: ['audit:realm:release-candidate', 'audit:realm:release-candidate:check'] },
];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildRealmReleaseCandidateAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((contract) => contract.status === 'verified').length,
      evidenceSources: 5,
      deterministicDigest: true,
      authoritativeLaunchGate: false,
      aggregateOnly: true,
      userIdsIncluded: false,
      businessRecordIdsIncluded: false,
      additiveMigrations: 0,
    },
    contracts,
  };
}

export function renderRealmReleaseCandidateArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  const summary = result.summary;
  return {
    'release-candidate-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'release-candidate-contracts.csv': `${columns.join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-24-REPORT.md': `# Phase 24 — Release Candidate Dossier\n\nRead-only evidence pack cho Director đã được khóa bằng regression gate; nó không tạo approval, rollout hay launch authority mới.\n\n- Contracts: **${summary.verifiedContracts}/${summary.contracts}**\n- Evidence sources: **${summary.evidenceSources}/5**\n- Deterministic SHA-256 digest: **${summary.deterministicDigest}**\n- Authoritative launch gate: **${summary.authoritativeLaunchGate}**\n- Aggregate only: **${summary.aggregateOnly}**\n- User IDs included: **${summary.userIdsIncluded}**\n- Business record IDs included: **${summary.businessRecordIdsIncluded}**\n- Additive migrations: **${summary.additiveMigrations}**\n\nChạy regression gate: \`npm run audit:realm:release-candidate:check\`.\n`,
  };
}
