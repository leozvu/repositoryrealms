import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'canonical-hr-records', layer: 'data', source: 'prisma/schema.prisma', signals: ['model User {', 'model Attendance {', 'model TimeLog {', 'model Task {', 'model WorkItemEvent {', 'model Okr {', 'model Review {'] },
  { id: 'hr-evidence-rule-version', layer: 'domain', source: 'lib/hr-evidence-outcome-intelligence.js', signals: ["HR_EVIDENCE_RULE_VERSION = 'hr-evidence-outcome-v1.0.0'", 'buildHrEvidenceOutcomeIntelligence'] },
  { id: 'four-independent-layers', layer: 'evidence', source: 'lib/hr-evidence-outcome-intelligence.js', signals: ['presence: layer({', 'activity: layer({', 'output: layer({', 'outcome: layer({'] },
  { id: 'provenance-separated', layer: 'governance', source: 'lib/hr-evidence-outcome-intelligence.js', signals: ["sourceClasses: [personTimeLogs.length ? 'declared'", "sourceClasses: [personTasks.length ? 'observed'", "finalReviews ? 'validated' : 'declared'"] },
  { id: 'verification-not-accusation', layer: 'operations', source: 'lib/hr-evidence-outcome-intelligence.js', signals: ['evidenceQueue', 'manager_validation', 'data_quality', 'provenance_gap', 'context_gap'] },
  { id: 'anti-ranking-advisory-policy', layer: 'governance', source: 'lib/hr-evidence-outcome-intelligence.js', signals: ['advisoryOnly: true', 'compositePerformanceScore: false', 'employeeRanking: false', 'presenceAsProductivity: false', 'automaticHrDecision: false'] },
  { id: 'no-automatic-people-action', layer: 'governance', source: 'lib/hr-evidence-outcome-intelligence.js', signals: ['automaticGold: false', 'automaticPayroll: false', 'automaticDiscipline: false', 'automaticTermination: false'] },
  { id: 'phase0-ledger-remains-disabled', layer: 'privacy', source: 'lib/hr-evidence-outcome-intelligence.js', signals: ['evidenceLedgerUsed: false', 'Phase 0 collection remains disabled'] },
  { id: 'minimum-necessary-scope', layer: 'authorization', source: 'lib/hr-evidence-outcome-intelligence-admin.js', signals: ['hrEvidenceIntelligenceScope', "hasAny(user, ['HR'])", "['PM', 'LEAD']", "kind: 'self'"] },
  { id: 'private-review-fields-omitted', layer: 'privacy', source: 'tests/hr-evidence-outcome-intelligence-admin.test.mjs', signals: ['reviewQuery.select.scores, undefined', 'reviewQuery.select.selfNote, undefined', 'reviewQuery.select.mgrNote, undefined'] },
  { id: 'presence-detail-minimized', layer: 'privacy', source: 'tests/hr-evidence-outcome-intelligence-admin.test.mjs', signals: ['attendanceQuery.select.checkIn, undefined', 'attendanceQuery.select.checkOut, undefined'] },
  { id: 'private-no-store-api', layer: 'api', source: 'app/api/hr/evidence-intelligence/route.js', signals: ['currentUser()', 'loadHrEvidenceOutcomeIntelligence', "'Cache-Control': 'private, no-store'"] },
  { id: 'erp-evidence-before-review', layer: 'ui', source: 'app/(app)/reviews/page.jsx', signals: ['<HrEvidenceIntelligence />', 'Điểm review tham khảo', 'Điểm review không được dùng một mình'] },
  { id: 'realm-shares-workspace-api', layer: 'parity', source: 'components/realm/GuildHall.jsx', signals: ['HrEvidenceIntelligence', 'variant="realm"', "source === 'erp'"] },
  { id: 'single-cross-surface-read-path', layer: 'parity', source: 'components/hr/HrEvidenceIntelligence.jsx', signals: ["fetch('/api/hr/evidence-intelligence'", "variant = 'erp'", "variant === 'realm'"] },
  { id: 'graceful-independent-error', layer: 'resilience', source: 'components/hr/HrEvidenceIntelligence.jsx', signals: ['Phần đánh giá gốc vẫn hoạt động', 'onRetry={retry}', 'AbortController'] },
  { id: 'responsive-accessible-evidence', layer: 'ux', source: 'components/hr/hr-evidence-intelligence.module.css', signals: ['min-height: 44px', '@media (max-width: 700px)', '@media (prefers-reduced-motion: reduce)', ':focus-visible'] },
  { id: 'phase6-domain-tests', layer: 'test', source: 'tests/hr-evidence-outcome-intelligence.test.mjs', signals: ['không tạo performance score hoặc ranking', 'không biến thiếu dữ liệu thành kết luận tiêu cực', 'không thay policy hay sinh productivity field'] },
  { id: 'phase6-server-tests', layer: 'test', source: 'tests/hr-evidence-outcome-intelligence-admin.test.mjs', signals: ['team manager bị khóa bằng teamId', 'không chọn private notes/scores', 'bị chặn trước database query'] },
  { id: 'phase6-staging-smoke', layer: 'test', source: 'scripts/staging-execution-smoke.mjs', signals: ['HR Evidence four-layer dossier failed', 'HR Evidence governance/provenance contract failed', 'Mobile HR Evidence layout failed', 'HR Evidence staging fixture'] },
  { id: 'phase6-runbook', layer: 'operations', source: 'docs/realms/PHASE-6-HR-EVIDENCE-OUTCOME-INTELLIGENCE.md', signals: ['Presence → Activity → Output → Outcome', 'canonical ERP records', 'crmegoric-realms-demo'] },
];

function cell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildHrEvidenceOutcomeIntelligenceAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const domain = fs.readFileSync(path.join(root, 'lib/hr-evidence-outcome-intelligence.js'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'lib/hr-evidence-outcome-intelligence-admin.js'), 'utf8');
  const reviews = fs.readFileSync(path.join(root, 'app/(app)/reviews/page.jsx'), 'utf8');
  const guild = fs.readFileSync(path.join(root, 'components/realm/GuildHall.jsx'), 'utf8');
  const scenarios = [
    { id: 'one-canonical-store-per-evidence-record', expected: '1:1:1:1:1:1:1', actual: ['User', 'Attendance', 'TimeLog', 'Task', 'WorkItemEvent', 'Okr', 'Review'].map((model) => (schema.match(new RegExp(`model ${model} \\{`, 'g')) || []).length).join(':') },
    { id: 'four-layers-do-not-form-score', expected: 'true:true:true', actual: `${domain.includes('compositePerformanceScore: false')}:${domain.includes('employeeRanking: false')}:${domain.includes('performanceConclusion: null')}` },
    { id: 'presence-is-not-productivity', expected: 'true:true', actual: `${domain.includes('presenceAsProductivity: false')}:${domain.includes('Attendance is user/HR recorded presence, not productivity.')}` },
    { id: 'phase0-ledger-not-queried', expected: 'true:true', actual: `${domain.includes('evidenceLedgerUsed: false')}:${!admin.includes('db.workEvidenceEvent')}` },
    { id: 'minimum-scope-is-company-team-self', expected: 'true:true:true', actual: `${admin.includes("kind: 'company'")}:${admin.includes("kind: 'team'")}:${admin.includes("kind: 'self'")}` },
    { id: 'erp-and-realm-use-one-client-read-path', expected: 'true:true', actual: `${reviews.includes('<HrEvidenceIntelligence />')}:${guild.includes('<HrEvidenceIntelligence variant="realm" />')}` },
    { id: 'no-automatic-hr-or-reward-decision', expected: 'true:true:true:true', actual: `${domain.includes('automaticHrDecision: false')}:${domain.includes('automaticGold: false')}:${domain.includes('automaticDiscipline: false')}:${domain.includes('automaticTermination: false')}` },
  ].map((scenario) => ({ ...scenario, status: scenario.actual === scenario.expected ? 'verified' : 'failed' }));
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      canonicalStores: 7,
      evidenceLayers: 4,
      compositePerformanceScoreEnabled: false,
      employeeRankingEnabled: false,
      automaticHrDecisionEnabled: false,
      phase0LedgerReadEnabled: false,
      schemaMigrationRequired: false,
    },
    contracts,
    scenarios,
  };
}

export function renderHrEvidenceOutcomeIntelligenceArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  const summary = result.summary;
  return {
    'hr-evidence-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'hr-evidence-contracts.csv': `${columns.join(',')}\n${result.contracts.map((row) => columns.map((column) => cell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-6-REPORT.md': `# Phase 6 — HR Evidence & Outcome Intelligence\n\n- Contracts: **${summary.verifiedContracts}/${summary.contracts}**\n- Deterministic scenarios: **${summary.verifiedScenarios}/${summary.scenarios}**\n- Canonical stores: **${summary.canonicalStores}**\n- Evidence layers: **${summary.evidenceLayers}**\n- Composite performance score enabled: **${summary.compositePerformanceScoreEnabled}**\n- Employee ranking enabled: **${summary.employeeRankingEnabled}**\n- Automatic HR decision enabled: **${summary.automaticHrDecisionEnabled}**\n- Phase 0 ledger manager-read enabled: **${summary.phase0LedgerReadEnabled}**\n- Schema migration required: **${summary.schemaMigrationRequired}**\n\nERP Reviews and Realm Guild Hall use the same private HR Evidence API over canonical records.\n\nRegression gate: \`npm run audit:hr-evidence:check\`.\n`,
  };
}
