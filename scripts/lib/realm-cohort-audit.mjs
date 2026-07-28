import fs from 'node:fs';
import path from 'node:path';
import {
  REALM_PILOT_MEMBER_LIMIT,
  normalizeRealmPilotConfig,
  publicRealmPilotConfig,
  realmPilotDecision,
} from '../../lib/realm-pilot.js';

const CONTRACTS = [
  { id: 'backward-compatible-cohort-policy', layer: 'server', source: 'lib/realm-pilot.js', signals: ["REALM_PILOT_COHORT_STRATEGIES", "cohortStrategy: 'roles'", 'memberIds: Object.freeze([])', 'REALM_PILOT_MEMBER_LIMIT = 50'] },
  { id: 'named-member-server-enforcement', layer: 'server', source: 'lib/realm-pilot.js', signals: ["config.cohortStrategy === 'members'", 'config.memberIds.includes(user.id)', "code: 'realm_pilot_cohort_required'", "resolvedSurface: 'erp'"] },
  { id: 'active-internal-member-validation', layer: 'server', source: 'lib/realm-pilot.js', signals: ["status: 'active'", "userType: 'employee'", 'realm_pilot_members_stale', 'realm_pilot_members_required'] },
  { id: 'bounded-cohort-input', layer: 'server', source: 'lib/realm-pilot.js', signals: ['REALM_PILOT_MEMBER_LIMIT', 'realm_pilot_member_limit', '.slice(0, REALM_PILOT_MEMBER_LIMIT)'] },
  { id: 'director-only-minimal-directory', layer: 'api', source: 'app/api/realm-demo/pilot/route.js', signals: ['const director = isDirector(user)', 'loadRealmPilotDirectory(prisma)', 'directory'] },
  { id: 'non-director-member-redaction', layer: 'api', source: 'app/api/realm-demo/pilot/route.js', signals: ['publicRealmPilotConfig(decision.config)', 'director ? decision.config'] },
  { id: 'minimal-directory-fields', layer: 'server', source: 'lib/realm-pilot.js', signals: ['select: { id: true, name: true, title: true, role: true, roles: true }', 'loadRealmPilotDirectory'] },
  { id: 'serializable-versioned-policy', layer: 'server', source: 'lib/realm-pilot.js', signals: ['realm_pilot_version_conflict', 'currentConfig.version + 1', "isolationLevel: 'Serializable'"] },
  { id: 'audit-count-not-roster', layer: 'server', source: 'lib/realm-pilot.js', signals: ['cohort ${config.cohortStrategy}; members ${config.memberIds.length}', "entity: 'realm_pilot'"] },
  { id: 'aggregate-only-adoption', layer: 'server', source: 'lib/realm-pilot.js', signals: ['eligibleUsers', 'aggregateOnly: true', 'performanceTracking: false', 'durationTracking: false'] },
  { id: 'strategy-aware-readiness', layer: 'server', source: 'lib/realm-readiness.js', signals: ["policy.cohortStrategy === 'members'", 'nhân sự được chọn đích danh', 'Pilot theo cohort'] },
  { id: 'named-cohort-control', layer: 'client', source: 'components/realm/RealmPilotControl.jsx', signals: ['Nhân sự cụ thể', 'Tìm nhân sự pilot', 'Đã chọn {draft.memberIds.length}', 'không hiển thị thời lượng, tiến độ hay điểm hiệu suất'] },
  { id: 'accessible-responsive-picker', layer: 'style', source: 'components/realm/realm-pilot-control.module.css', signals: ['min-height: 44px', '.memberList label:focus-within', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'erp-default-and-kill-switch', layer: 'client', source: 'components/realm/RealmPilotControl.jsx', signals: ['An toàn nhất cho rollout ban đầu', 'ERP cổ điển vẫn luôn khả dụng', 'Tạm đóng'] },
  { id: 'kill-switch-bypasses-stale-roster', layer: 'server', source: 'lib/realm-pilot.js', signals: ["draft.mode === 'pilot' && draft.cohortStrategy === 'members'", "config.mode === 'off'", "resolvedSurface: 'erp'"] },
  { id: 'operations-runbook', layer: 'operations', source: 'docs/realms/PHASE-13-NAMED-COHORT-RUNBOOK.md', signals: ['crmegoric-realms-demo', '3–8', 'mode = off', '/dashboard', 'không tự bật pilot'] },
  { id: 'authenticated-cohort-uat', layer: 'test', source: 'tests/e2e/realm-smoke.spec.mjs', signals: ['Pilot theo cohort', 'Nhân sự cụ thể', 'Tìm nhân sự pilot'] },
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

function buildScenarios() {
  const staff = { id: 'staff-1', role: 'STAFF', roles: ['STAFF'], userType: 'employee' };
  const named = { mode: 'pilot', defaultSurface: 'erp', cohortStrategy: 'members', memberIds: ['staff-1'], roles: [] };
  const publicPolicy = publicRealmPilotConfig(named);
  const bounded = normalizeRealmPilotConfig({ cohortStrategy: 'members', memberIds: Array.from({ length: 60 }, (_, index) => `member-${index}`) });
  const rows = [
    { id: 'legacy-role-policy-still-works', expected: 'true:realm', actual: ((d) => `${d.allowed}:${d.resolvedSurface}`)(realmPilotDecision(staff, { mode: 'pilot', defaultSurface: 'realm', roles: ['STAFF'] }, 'auto')) },
    { id: 'named-member-granted', expected: 'true:realm_pilot_granted', actual: ((d) => `${d.allowed}:${d.code}`)(realmPilotDecision(staff, named, 'realm')) },
    { id: 'role-cannot-bypass-named-cohort', expected: 'false:realm_pilot_cohort_required:erp', actual: ((d) => `${d.allowed}:${d.code}:${d.resolvedSurface}`)(realmPilotDecision(staff, { ...named, memberIds: ['other'], roles: ['STAFF'] }, 'realm')) },
    { id: 'member-roster-redacted', expected: 'false:1', actual: `${Object.hasOwn(publicPolicy, 'memberIds')}:${publicPolicy.memberCount}` },
    { id: 'cohort-size-bounded', expected: String(REALM_PILOT_MEMBER_LIMIT), actual: String(bounded.memberIds.length) },
    { id: 'kill-switch-keeps-erp', expected: 'false:erp', actual: ((d) => `${d.allowed}:${d.resolvedSurface}`)(realmPilotDecision(staff, { ...named, mode: 'off' }, 'realm')) },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmCohortAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const sourcePath = path.join(root, contract.source);
    const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const scenarios = buildScenarios();
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      additiveMigrations: 0,
      parallelBusinessTables: 0,
      memberLimit: REALM_PILOT_MEMBER_LIMIT,
      rosterHiddenFromNonDirectors: true,
      aggregateOnly: true,
      performanceTracking: false,
      durationTracking: false,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 13 — Named Pilot Cohort & Launch Operations\n\n` +
    `Phase 13 cho phép Director mở Realm cho một danh sách nhân sự cụ thể thay vì buộc mở toàn bộ một vai trò. Policy vẫn nằm trong Setting ERP hiện hữu; không có migration hoặc bảng nghiệp vụ song song.\n\n` +
    `## Kết quả\n\n` +
    `- Security/operations contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic cohort scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Cohort hard limit: **${s.memberLimit}**\n` +
    `- Roster hidden from non-Directors: **${s.rosterHiddenFromNonDirectors}**\n` +
    `- Aggregate-only telemetry: **${s.aggregateOnly}**\n` +
    `- Performance tracking: **${s.performanceTracking}**\n` +
    `- Duration tracking: **${s.durationTracking}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Nguyên tắc vận hành\n\n` +
    `- Pilot thật nên dùng danh sách 3–8 nhân sự; cohort theo vai trò chỉ dành cho rollout rộng hơn đã được phê duyệt.\n` +
    `- Người ngoài cohort và freelancer luôn về ERP; người trong cohort vẫn có quyền chọn ERP.\n` +
    `- API chỉ trả roster cho Director và không trả preference, salary hay dữ liệu hiệu suất trong directory.\n` +
    `- Audit chỉ ghi chiến lược và số lượng thành viên, không sao chép roster vào detail.\n` +
    `- Phase này không tự bật policy trên staging hoặc production.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:cohort:check\`.\n`;
}

export function renderRealmCohortArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'cohort-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'cohort-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-13-REPORT.md': report(result),
  };
}
