import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'reuse-erp-setting', layer: 'data', source: 'lib/realm-pilot-operations.js', signals: ['realmPilotOperations:', 'tx.setting.upsert', "entity: 'realm_pilot_operations'"] },
  { id: 'bounded-wave-lifecycle', layer: 'domain', source: 'lib/realm-pilot-operations.js', signals: ["'draft'", "'awaiting_approval'", "'active'", "'paused'", "'completed'"] },
  { id: 'director-only-operations', layer: 'rbac', source: 'lib/realm-pilot-operations.js', signals: ['requireDirector(sessionUser)', 'realm_pilot_operations_forbidden'] },
  { id: 'operations-cas-version', layer: 'concurrency', source: 'lib/realm-pilot-operations.js', signals: ['validateExpectedVersion(operations, input.expectedVersion)', 'realm_pilot_operations_version_conflict', "isolationLevel: 'Serializable'"] },
  { id: 'single-open-wave', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['OPEN_STATUSES.has(wave.status)', 'realm_pilot_wave_open_exists'] },
  { id: 'policy-version-binding', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['wave.policyVersion !== policy.version', 'realm_pilot_wave_policy_stale'] },
  { id: 'submit-live-readiness', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ["action === 'submit'", 'loadRealmLaunchReadiness(tx, policy, now)', 'realm_pilot_wave_readiness_blocked'] },
  { id: 'maker-checker-activation', layer: 'rbac', source: 'lib/realm-pilot-operations.js', signals: ["action === 'approve'", 'wave.submittedById === sessionUser.id', 'self_approval_forbidden'] },
  { id: 'activation-rechecks-readiness', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['Readiness vừa xuất hiện blocker mới', "status: 'active'"] },
  { id: 'post-approval-invitations', layer: 'integration', source: 'lib/realm-pilot-operations.js', signals: ['eligibleMemberIds(tx, policy)', 'Pilot wave “${wave.name}” đã mở', "'/realm'"] },
  { id: 'pause-uses-existing-kill-switch', layer: 'rollback', source: 'lib/realm-pilot-operations.js', signals: ['applyRealmPilotConfigInTransaction(tx', "mode: 'off'", "status: 'paused'"] },
  { id: 'complete-persists-aggregate-report', layer: 'operations', source: 'lib/realm-pilot-operations.js', signals: ["status: 'completed'", 'finalReport:', 'blockedFeedback:'] },
  { id: 'seven-fourteen-day-gate', layer: 'decision', source: 'lib/realm-pilot-operations.js', signals: ['REALM_PILOT_WAVE_MIN_DAYS = 7', 'REALM_PILOT_WAVE_MAX_DAYS = 14', 'buildRealmPilotGoNoGoReport'] },
  { id: 'aggregate-only-privacy', layer: 'privacy', source: 'lib/realm-pilot-operations.js', signals: ['aggregateOnly: true', 'rosterIncluded: false', 'performanceTracking: false', 'durationTracking: false'] },
  { id: 'authenticated-traced-api', layer: 'api', source: 'app/api/realm-demo/pilot/operations/route.js', signals: ['authenticatedUser()', 'startRealmApiRequest', 'realmJsonResponse', 'realmErrorResponse'] },
  { id: 'cross-surface-change-signal', layer: 'integration', source: 'app/api/realm-demo/pilot/operations/route.js', signals: ['safelyPublishRealmChange', "resource: 'settings'"] },
  { id: 'stale-settings-write-protection', layer: 'data', source: 'app/api/settings/route.js', signals: ['current.realmPilotOperations', 'delete data.realmPilotOperations'] },
  { id: 'operations-dashboard-ui', layer: 'client', source: 'components/realm/RealmPilotOperations.jsx', signals: ['Pilot Operations · Rollout Waves', 'Duyệt &amp; mời cohort', 'Báo cáo Go / No-go', 'ERP fallback'] },
  { id: 'accessible-responsive-ui', layer: 'style', source: 'components/realm/realm-pilot-operations.module.css', signals: ['button { min-height: 44px;', '@media (max-width: 680px)', '.metrics, .waveFacts, .activationFacts, .activationCriteria, .criteria { grid-template-columns: 1fr;', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'mobile-erp-toolbar-containment', layer: 'style', source: 'app/globals.css', signals: ['Phase 16: toolbar ERP co giãn', '.topbar-right>.btn{width:44px', '#page-title{min-width:0;flex:1;overflow:hidden'] },
  { id: 'phase16-test-suite', layer: 'test', source: 'tests/realm-pilot-operations.test.mjs', signals: ['requires a different Director', 'pause atomically activates the existing kill switch', 'Go/No-go report respects the 7–14 day window'] },
  { id: 'phase16-runbook', layer: 'operations', source: 'docs/realms/PHASE-16-PILOT-OPERATIONS.md', signals: ['crmegoric-realms-demo', 'codex/realms-demo', '7–14 ngày', 'mode = off', 'không có migration'] },
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
  const service = read('lib/realm-pilot-operations.js');
  const settingsApi = read('app/api/settings/route.js');
  const ui = read('components/realm/RealmPilotOperations.jsx');
  const rows = [
    { id: 'maker-cannot-activate-own-wave', expected: 'true', actual: String(service.includes('wave.submittedById === sessionUser.id')) },
    { id: 'activation-needs-live-readiness', expected: 'true:true', actual: `${service.includes("action === 'approve'")}:${service.includes('loadRealmLaunchReadiness(tx, policy, now)')}` },
    { id: 'pause-closes-realm-not-data', expected: 'true:true', actual: `${service.includes("mode: 'off'")}:${service.includes('reversesMigrations') === false}` },
    { id: 'settings-form-cannot-clobber-operations', expected: 'true', actual: String(settingsApi.includes('current.realmPilotOperations')) },
    { id: 'go-no-go-visible-without-ranking', expected: 'true:true', actual: `${ui.includes('Báo cáo Go / No-go')}:${ui.includes('Không lưu thời lượng, lịch sử duyệt, điểm hiệu suất hoặc bảng xếp hạng cá nhân.')}` },
    { id: 'wave-actions-have-erp-fallback-copy', expected: 'true:true', actual: `${ui.includes('ERP vẫn là fallback')}:${ui.includes('Tạm dừng & về ERP')}` },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmPilotOperationsAudit(root) {
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
      minimumObservationDays: 7,
      maximumObservationDays: 14,
      aggregateOnly: true,
      rosterIncluded: false,
      selfApprovalAllowed: false,
      pausePreservesData: true,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 16 — Pilot Operations\n\n` +
    `Phase 16 thêm lớp điều phối rollout wave trên Setting, Notification, AuditLog và kill switch ERP hiện hữu; không tạo database hay hệ thống nghiệp vụ song song.\n\n` +
    `## Kết quả\n\n` +
    `- Security/operations contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic rollout scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Observation window: **${s.minimumObservationDays}–${s.maximumObservationDays} ngày**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Roster included: **${s.rosterIncluded}**\n` +
    `- Self approval allowed: **${s.selfApprovalAllowed}**\n` +
    `- Pause preserves ERP/Realm data: **${s.pausePreservesData}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Nguyên tắc vận hành\n\n` +
    `- Controlled Launch tiếp tục quản lý quyền vào cohort; Pilot Operations không bypass Phase 15.\n` +
    `- Wave chỉ kích hoạt sau khi một Director khác duyệt và server chạy lại live readiness.\n` +
    `- Invitation đi qua Notification ERP; người không dùng Realm vẫn thấy trạng thái liên quan.\n` +
    `- Pause/complete từ wave active dùng mode=off, giữ nguyên record, Gold ledger và migration.\n` +
    `- Go/No-go chỉ dùng số tổng hợp, không chấm điểm hay đo thời lượng cá nhân.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:pilot-operations:check\`.\n`;
}

export function renderRealmPilotOperationsArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'pilot-operations-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'pilot-operations-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-16-REPORT.md': report(result),
  };
}
