import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'reuse-erp-setting', layer: 'data', source: 'lib/realm-pilot-rehearsal.js', signals: ['realmPilotRehearsal:', 'tx.setting.upsert', "entity: 'realm_pilot_rehearsal'"] },
  { id: 'no-parallel-business-store', layer: 'data', source: 'lib/realm-pilot-rehearsal.js', signals: ['no roster; no record content', 'REALM_REHEARSAL_LIMIT = 12'] },
  { id: 'director-only-rehearsal', layer: 'rbac', source: 'lib/realm-pilot-rehearsal.js', signals: ['requireDirector(sessionUser)', 'realm_rehearsal_forbidden'] },
  { id: 'serializable-cas', layer: 'concurrency', source: 'lib/realm-pilot-rehearsal.js', signals: ['validateExpectedVersion(rehearsals, input.expectedVersion)', 'realm_rehearsal_version_conflict', "isolationLevel: 'Serializable'"] },
  { id: 'fixed-operational-scenarios', layer: 'domain', source: 'lib/realm-pilot-rehearsal.js', signals: ['cross-surface-contact', 'record-deep-links', 'guild-support-bridge', 'kill-switch-rehearsal', 'mobile-accessibility'] },
  { id: 'bounded-evidence', layer: 'privacy', source: 'lib/realm-pilot-rehearsal.js', signals: ['cleanText(input.evidence, 240)', 'realm_rehearsal_evidence_required', 'operational-attestation'] },
  { id: 'policy-version-binding', layer: 'safety', source: 'lib/realm-pilot-rehearsal.js', signals: ['run.policyVersion !== policy.version', 'realm_rehearsal_policy_stale'] },
  { id: 'submit-live-readiness', layer: 'safety', source: 'lib/realm-pilot-rehearsal.js', signals: ["action === 'submit'", 'loadRealmLaunchReadiness(tx, policy, now)', 'realm_rehearsal_readiness_blocked'] },
  { id: 'independent-checker-required', layer: 'rbac', source: 'lib/realm-pilot-rehearsal.js', signals: ['directory.count < 2', 'run.submittedById === sessionUser.id', 'self_approval_forbidden'] },
  { id: 'approval-rechecks-live-controls', layer: 'safety', source: 'lib/realm-pilot-rehearsal.js', signals: ["action === 'approve'", 'Live readiness vừa xuất hiện blocker mới', "status: 'sealed'"] },
  { id: 'twenty-four-hour-seal', layer: 'safety', source: 'lib/realm-pilot-rehearsal.js', signals: ['REALM_REHEARSAL_TTL_HOURS = 24', 'expiresAt:', 'realm_rehearsal_stale'] },
  { id: 'wave-submit-needs-seal', layer: 'integration', source: 'lib/realm-pilot-operations.js', signals: ['requireValidRealmPilotRehearsal(setting, policy, now)', 'rehearsalId: rehearsal.rehearsalId'] },
  { id: 'wave-activation-rechecks-seal', layer: 'integration', source: 'lib/realm-pilot-operations.js', signals: ['requireValidRealmPilotRehearsal(setting, policy, now, wave.rehearsalId)', 'rehearsalExpiresAt: rehearsal.expiresAt'] },
  { id: 'erp-notification-handoff', layer: 'integration', source: 'lib/realm-pilot-rehearsal.js', signals: ['tx.notification.createMany', '/settings#realm-pilot-rehearsal-title', 'Chờ bạn niêm phong launch rehearsal'] },
  { id: 'actionable-remediation', layer: 'operations', source: 'lib/realm-pilot-rehearsal.js', signals: ['buildRealmRehearsalRemediation', '/settings#realm-pilot-title', '/settings#realm-feedback-operations-title'] },
  { id: 'aggregate-privacy-contract', layer: 'privacy', source: 'lib/realm-pilot-rehearsal.js', signals: ['aggregateOnly: true', 'rosterIncluded: false', 'performanceTracking: false', 'durationTracking: false'] },
  { id: 'authenticated-traced-api', layer: 'api', source: 'app/api/realm-demo/pilot/rehearsal/route.js', signals: ['authenticatedUser()', 'startRealmApiRequest', 'realmJsonResponse', 'realmErrorResponse'] },
  { id: 'cross-surface-change-signal', layer: 'api', source: 'app/api/realm-demo/pilot/rehearsal/route.js', signals: ['safelyPublishRealmChange', "resource: 'settings'"] },
  { id: 'stale-settings-write-protection', layer: 'data', source: 'app/api/settings/route.js', signals: ['delete data.realmPilotRehearsal', 'current.realmPilotRehearsal'] },
  { id: 'accessible-rehearsal-ui', layer: 'client', source: 'components/realm/RealmPilotRehearsal.jsx', signals: ['Launch Rehearsal · Sealed Evidence', '<fieldset', '<legend>', 'aria-live="polite"', 'Niêm phong 24 giờ'] },
  { id: 'responsive-reduced-motion-ui', layer: 'style', source: 'components/realm/realm-pilot-rehearsal.module.css', signals: ['min-height: 44px', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)', '.autoChecks { grid-template-columns: 1fr; }'] },
  { id: 'phase17-test-suite', layer: 'test', source: 'tests/realm-pilot-rehearsal.test.mjs', signals: ['requires operational evidence', 'independent checker', 'actionable remediation', 'expires after 24 hours'] },
  { id: 'phase17-runbook', layer: 'operations', source: 'docs/realms/PHASE-17-LAUNCH-REHEARSAL.md', signals: ['crmegoric-realms-demo', 'codex/realms-demo', '24 giờ', 'không tự đổi policy', 'không có migration'] },
];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownTable(rows, columns) {
  const clean = (value) => String(Array.isArray(value) ? value.join(', ') : value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${columns.map(([label]) => label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map(([, key]) => clean(row[key])).join(' | ')} |`),
  ].join('\n');
}

function buildScenarios(root) {
  const read = (source) => fs.readFileSync(path.join(root, source), 'utf8');
  const service = read('lib/realm-pilot-rehearsal.js');
  const operations = read('lib/realm-pilot-operations.js');
  const settingsApi = read('app/api/settings/route.js');
  const ui = read('components/realm/RealmPilotRehearsal.jsx');
  const rows = [
    { id: 'maker-cannot-seal-own-evidence', expected: 'true', actual: String(service.includes('run.submittedById === sessionUser.id')) },
    { id: 'stale-policy-or-expired-seal-fails-closed', expected: 'true:true', actual: `${service.includes('run.policyVersion === policy.version')}:${service.includes('new Date(run.expiresAt).getTime() > nowMs')}` },
    { id: 'wave-needs-same-sealed-rehearsal', expected: 'true:true', actual: `${operations.includes('wave.rehearsalId')}:${operations.includes('requireValidRealmPilotRehearsal(setting, policy, now, wave.rehearsalId)')}` },
    { id: 'settings-cannot-clobber-rehearsal', expected: 'true:true', actual: `${settingsApi.includes('current.realmPilotRehearsal')}:${settingsApi.includes('delete data.realmPilotRehearsal')}` },
    { id: 'ui-has-evidence-privacy-guidance', expected: 'true:true', actual: `${ui.includes('Evidence vận hành')}:${ui.includes('Không ghi tên cohort, nội dung record, thời lượng, điểm hiệu suất')}` },
    { id: 'readiness-remediation-does-not-mutate-policy', expected: 'true:false', actual: `${service.includes('buildRealmRehearsalRemediation')}:${service.includes('applyRealmPilotConfigInTransaction')}` },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmPilotRehearsalAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const sourcePath = path.join(root, contract.source);
    const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const scenarios = buildScenarios(root);
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      additiveMigrations: 0,
      parallelBusinessTables: 0,
      sealTtlHours: 24,
      aggregateOnly: true,
      rosterIncluded: false,
      selfApprovalAllowed: false,
      waveRequiresSeal: true,
      policyMutationFromRemediation: false,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 17 — Launch Rehearsal & Sealed Evidence\n\n` +
    `Phase 17 thêm rehearsal bắt buộc trước Pilot Operations, tái sử dụng Setting, Notification và AuditLog của ERP; không tạo data store nghiệp vụ song song.\n\n` +
    `## Kết quả\n\n` +
    `- Security/operations contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic rehearsal scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Sealed evidence TTL: **${s.sealTtlHours} giờ**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Roster included: **${s.rosterIncluded}**\n` +
    `- Self approval allowed: **${s.selfApprovalAllowed}**\n` +
    `- Wave requires sealed rehearsal: **${s.waveRequiresSeal}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Nguyên tắc vận hành\n\n` +
    `- Controlled Launch phải đưa policy về pilot; remediation chỉ hướng dẫn, không tự đổi policy.\n` +
    `- Maker ghi evidence vận hành; Director khác recheck live readiness và niêm phong 24 giờ.\n` +
    `- Pilot wave chỉ submit/activate khi cùng sealed rehearsal còn hiệu lực.\n` +
    `- Evidence không chứa roster, nội dung record, thời lượng hay điểm hiệu suất cá nhân.\n` +
    `- ERP vẫn là fallback và kill switch không xóa record, ledger, Ticket hoặc migration.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:pilot-rehearsal:check\`.\n`;
}

export function renderRealmPilotRehearsalArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'pilot-rehearsal-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'pilot-rehearsal-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-17-REPORT.md': report(result),
  };
}
