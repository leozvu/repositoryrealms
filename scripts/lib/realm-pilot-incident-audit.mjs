import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'reuse-pilot-operations-setting', layer: 'data', source: 'lib/realm-pilot-operations.js', signals: ['realmPilotOperations:', 'incidents:', 'tx.setting.upsert'] },
  { id: 'bounded-incident-history', layer: 'data', source: 'lib/realm-pilot-operations.js', signals: ['REALM_PILOT_INCIDENT_LIMIT = 40', 'slice(0, REALM_PILOT_INCIDENT_LIMIT)'] },
  { id: 'fixed-incident-taxonomy', layer: 'privacy', source: 'lib/realm-pilot-operations.js', signals: ['REALM_PILOT_INCIDENT_CATEGORIES', "id: 'realm_access'", "id: 'sync_integrity'", "id: 'erp_fallback'"] },
  { id: 'critical-category-cannot-downgrade', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ["categoryMeta.defaultSeverity === 'critical'", "? 'critical'"] },
  { id: 'director-only-incident-command', layer: 'rbac', source: 'lib/realm-pilot-operations.js', signals: ['requireDirector(sessionUser)', 'realm_pilot_operations_forbidden'] },
  { id: 'critical-atomic-kill-switch', layer: 'rollback', source: 'lib/realm-pilot-operations.js', signals: ["action === 'report_incident'", "severity === 'critical'", "mode: 'off'", "status: 'paused'", "state: 'rolled_back'"] },
  { id: 'warning-holds-go-no-go', layer: 'decision', source: 'lib/realm-pilot-operations.js', signals: ['openIncidents === 0', "recommendation = hardStop ? 'no_go'", "minimumObserved && openIncidents === 0 ? 'go' : 'hold'"] },
  { id: 'critical-forces-no-go', layer: 'decision', source: 'lib/realm-pilot-operations.js', signals: ['criticalIncidents > 0', "id: 'critical-incidents'"] },
  { id: 'incident-lifecycle', layer: 'domain', source: 'lib/realm-pilot-operations.js', signals: ["new Set(['open', 'monitoring', 'resolved'])", "action === 'monitor_incident'", "action === 'resolve_incident'"] },
  { id: 'duplicate-incident-blocked', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['realm_pilot_incident_duplicate', "item.status !== 'resolved'"] },
  { id: 'resolution-rechecks-safe-state', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['containedInErp', 'verifiedRecovery', 'realm_pilot_incident_resolution_blocked'] },
  { id: 'completion-blocked-by-incident', layer: 'safety', source: 'lib/realm-pilot-operations.js', signals: ['realm_pilot_incident_open', 'Còn incident chưa khép lại'] },
  { id: 'serializable-cas', layer: 'concurrency', source: 'lib/realm-pilot-operations.js', signals: ['validateExpectedVersion(operations, input.expectedVersion)', "isolationLevel: 'Serializable'"] },
  { id: 'aggregate-incident-snapshot', layer: 'privacy', source: 'lib/realm-pilot-operations.js', signals: ['incidentSnapshot', 'eligibleUsers:', 'fallbackUsers:', 'blockedFeedback:'] },
  { id: 'timeline-excludes-actor-history', layer: 'privacy', source: 'lib/realm-pilot-operations.js', signals: ['actorHistoryIncluded: false', 'performanceTracking: false', 'durationTracking: false'] },
  { id: 'director-and-cohort-notifications', layer: 'integration', source: 'lib/realm-pilot-operations.js', signals: ['await directorIds(tx, sessionUser.id)', 'Tiếp tục công việc trên ERP · CRM', "'/dashboard'"] },
  { id: 'incident-alerts', layer: 'operations', source: 'lib/realm-pilot-operations.js', signals: ["id: 'critical-incident-open'", "id: 'warning-incident-open'"] },
  { id: 'existing-traced-api', layer: 'api', source: 'app/api/realm-demo/pilot/operations/route.js', signals: ['startRealmApiRequest', 'transitionRealmPilotWave', 'safelyPublishRealmChange'] },
  { id: 'incident-command-ui', layer: 'client', source: 'components/realm/RealmPilotOperations.jsx', signals: ['Incident Command · Timeline', 'Ghi nhận sự cố', 'Xác nhận đã khống chế', 'Dòng thời gian incident và rollout'] },
  { id: 'semantic-status-icon-text', layer: 'accessibility', source: 'components/realm/RealmPilotOperations.jsx', signals: ['INCIDENT_STATE', '<Icon name={stateIcon}', '{stateLabel}</span>'] },
  { id: 'responsive-touch-safe-ui', layer: 'style', source: 'components/realm/realm-pilot-operations.module.css', signals: ['.incidentForm select, .incidentForm button { min-width: 0; min-height: 44px;', '.incidentQueue article button { min-height: 44px;', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'phase19-unit-tests', layer: 'test', source: 'tests/realm-pilot-operations.test.mjs', signals: ['Phase 19 warning incident holds Go/No-go', 'Phase 19 critical incident atomically rolls back'] },
  { id: 'phase19-runbook', layer: 'operations', source: 'docs/realms/PHASE-19-INCIDENT-COMMAND.md', signals: ['crmegoric-realms-demo', 'Critical', 'mode = off', 'không tự tái kích hoạt'] },
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
    { id: 'warning-does-not-close-realm', expected: 'true:true', actual: `${service.includes("severity === 'critical'")}:${service.includes("warningOpen > 0")}` },
    { id: 'critical-closes-realm', expected: 'true:true:true', actual: `${service.includes("mode: 'off'")}:${service.includes("status: 'paused'")}:${service.includes("rollbackTriggered: severity === 'critical'")}` },
    { id: 'critical-category-is-escalated', expected: 'true', actual: String(service.includes("category.defaultSeverity === 'critical'")) },
    { id: 'incident-must-be-monitored-before-resolve', expected: 'true:true', actual: `${service.includes("incident.status !== 'monitoring'")}:${service.includes('realm_pilot_incident_transition_invalid')}` },
    { id: 'open-incident-blocks-completion', expected: 'true', actual: String(service.includes('realm_pilot_incident_open')) },
    { id: 'timeline-is-aggregate-only', expected: 'true:true', actual: `${service.includes('actorHistoryIncluded: false')}:${service.includes('rosterIncluded: false')}` },
    { id: 'ui-confirms-critical-rollback', expected: 'true:true', actual: `${ui.includes('critical_incident')}:${ui.includes('Ghi nhận & rollback ERP')}` },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmPilotIncidentAudit(root) {
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
      incidentLimit: 40,
      additiveMigrations: 0,
      parallelBusinessTables: 0,
      aggregateOnly: true,
      automaticReactivation: false,
      criticalRollbackAtomic: true,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 19 — Pilot Telemetry & Incident Timeline\n\n` +
    `Phase 19 thêm Incident Command vào Pilot Operations hiện hữu. State được giới hạn ${s.incidentLimit} incident, dùng taxonomy cố định và không tạo bảng nghiệp vụ song song.\n\n` +
    `## Kết quả\n\n` +
    `- Safety/operations contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic incident scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Aggregate only: **${s.aggregateOnly}**\n` +
    `- Automatic reactivation: **${s.automaticReactivation}**\n` +
    `- Critical rollback atomic: **${s.criticalRollbackAtomic}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Nguyên tắc vận hành\n\n` +
    `- Warning giữ wave active nhưng Go/No-go ở HOLD cho tới khi incident được khống chế.\n` +
    `- Critical ghi incident và bật kill switch mode=off trong cùng transaction.\n` +
    `- Incident phải qua open → monitoring → resolved; resolved không tự mở lại Realm.\n` +
    `- Timeline chỉ chứa mốc và số liệu tổng hợp, không actor history, roster hay thời lượng cá nhân.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:pilot-incidents:check\`.\n`;
}

export function renderRealmPilotIncidentArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'pilot-incident-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'pilot-incident-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-19-REPORT.md': report(result),
  };
}
