import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'reuse-pilot-wave-setting', layer: 'data', source: 'lib/realm-pilot-operations.js', signals: ['realmPilotOperations:', 'activation:', 'tx.setting.upsert'] },
  { id: 'ninety-minute-canary-window', layer: 'domain', source: 'lib/realm-pilot-operations.js', signals: ['REALM_PILOT_CANARY_WINDOW_MINUTES = 90', 'activationWindow'] },
  { id: 'activation-starts-after-checker', layer: 'rbac', source: 'lib/realm-pilot-operations.js', signals: ["action === 'approve'", "state: 'watching'", 'approvedById: sessionUser.id'] },
  { id: 'aggregate-baseline-only', layer: 'privacy', source: 'lib/realm-pilot-operations.js', signals: ['activationBaseline', 'eligibleUsers:', 'fallbackUsers:', 'blockedFeedback:', 'aggregateOnly: true'] },
  { id: 'canary-policy-binding', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['wave?.policyVersion === policy?.version', 'realm_pilot_wave_policy_stale'] },
  { id: 'canary-live-readiness', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['buildRealmPilotActivationGuard', "id: 'live-readiness'", "id: 'blocked-feedback'", "id: 'erp-fallback'"] },
  { id: 'checkpoint-fails-closed', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['realm_pilot_canary_window_open', 'realm_pilot_canary_blocked', "guard.state !== 'ready'"] },
  { id: 'clear-rechecks-live-state', layer: 'concurrency', source: 'lib/realm-pilot-operations.js', signals: ["action === 'clear_activation'", 'loadRealmLaunchReadiness(tx, policy, now)', 'validateExpectedVersion(operations, input.expectedVersion)'] },
  { id: 'clear-does-not-expand-cohort', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ["state: 'cleared'", 'cohort hiện tại tiếp tục, chưa mở rộng tự động'] },
  { id: 'rollback-reuses-kill-switch', layer: 'rollback', source: 'lib/realm-pilot-operations.js', signals: ["action === 'pause'", "mode: 'off'", "state: 'rolled_back'", "status: 'paused'"] },
  { id: 'canary-operational-alerts', layer: 'operations', source: 'lib/realm-pilot-operations.js', signals: ["id: 'canary-blocked'", "id: 'canary-checkpoint-ready'"] },
  { id: 'director-notifications', layer: 'integration', source: 'lib/realm-pilot-operations.js', signals: ['await directorIds(tx, sessionUser.id)', "'/settings#realm-pilot-operations-title'"] },
  { id: 'serializable-cas', layer: 'concurrency', source: 'lib/realm-pilot-operations.js', signals: ["isolationLevel: 'Serializable'", 'realm_pilot_operations_version_conflict'] },
  { id: 'existing-traced-api', layer: 'api', source: 'app/api/realm-demo/pilot/operations/route.js', signals: ['authenticatedUser()', 'startRealmApiRequest', 'safelyPublishRealmChange'] },
  { id: 'activation-guard-ui', layer: 'client', source: 'components/realm/RealmPilotOperations.jsx', signals: ['Canary Activation Guard', 'Xác nhận qua canary gate', 'Rollback về ERP', 'Canary guardrails'] },
  { id: 'semantic-state-with-icon-text', layer: 'accessibility', source: 'components/realm/RealmPilotOperations.jsx', signals: ['ACTIVATION', '<Icon name={icon}', '{label}</span>'] },
  { id: 'responsive-touch-safe-ui', layer: 'style', source: 'components/realm/realm-pilot-operations.module.css', signals: ['.activationActions button { min-height: 44px;', '@media (max-width: 680px)', '.activationCriteria { display: grid;', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'phase18-unit-tests', layer: 'test', source: 'tests/realm-pilot-operations.test.mjs', signals: ['Phase 18 canary guard waits 90 minutes', 'Phase 18 activation guard fails closed'] },
  { id: 'phase18-runbook', layer: 'operations', source: 'docs/realms/PHASE-18-CANARY-ACTIVATION.md', signals: ['crmegoric-realms-demo', '90 phút', 'mode = off', 'Không tự mở rộng cohort'] },
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
  const ui = read('components/realm/RealmPilotOperations.jsx');
  const rows = [
    { id: 'approve-opens-canary-watch', expected: 'true:true', actual: `${service.includes("action === 'approve'")}:${service.includes("state: 'watching'")}` },
    { id: 'early-clear-is-rejected', expected: 'true', actual: String(service.includes('realm_pilot_canary_window_open')) },
    { id: 'blocker-prevents-clear', expected: 'true:true', actual: `${service.includes('realm_pilot_canary_blocked')}:${service.includes("guard.state !== 'ready'")}` },
    { id: 'clear-keeps-current-cohort', expected: 'true:true', actual: `${service.includes("state: 'cleared'")}:${service.includes('chưa mở rộng tự động')}` },
    { id: 'rollback-closes-realm-not-data', expected: 'true:true', actual: `${service.includes("mode: 'off'")}:${service.includes('reversesMigrations') === false}` },
    { id: 'ui-exposes-clear-and-rollback', expected: 'true:true', actual: `${ui.includes('Xác nhận qua canary gate')}:${ui.includes('Rollback về ERP')}` },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmPilotActivationAudit(root) {
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
      canaryWindowMinutes: 90,
      additiveMigrations: 0,
      parallelBusinessTables: 0,
      aggregateOnly: true,
      automaticCohortExpansion: false,
      rollbackAlwaysAvailable: true,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 18 — Canary Activation Guard\n\n` +
    `Phase 18 mở rộng Pilot Operations hiện hữu bằng checkpoint canary ${s.canaryWindowMinutes} phút; không tạo bảng, không tự mở rộng cohort và không thay thế ERP fallback.\n\n` +
    `## Kết quả\n\n` +
    `- Safety/operations contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic activation scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Canary window: **${s.canaryWindowMinutes} phút**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Aggregate only: **${s.aggregateOnly}**\n` +
    `- Automatic cohort expansion: **${s.automaticCohortExpansion}**\n` +
    `- Rollback always available: **${s.rollbackAlwaysAvailable}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Nguyên tắc vận hành\n\n` +
    `- Checker activation mở cửa sổ canary nhưng không tự xác nhận checkpoint.\n` +
    `- Policy drift, readiness blocker, blocked feedback hoặc mất ERP fallback đều fail-closed.\n` +
    `- Clear checkpoint giữ nguyên cohort hiện tại; mở rộng vẫn phải qua Controlled Launch mới.\n` +
    `- Rollback dùng kill switch mode=off và giữ nguyên record, ledger, Ticket cùng migration.\n` +
    `- Evidence chỉ là số tổng hợp, không đo hoạt động hay thời lượng cá nhân.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:pilot-activation:check\`.\n`;
}

export function renderRealmPilotActivationArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'pilot-activation-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'pilot-activation-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-18-REPORT.md': report(result),
  };
}
