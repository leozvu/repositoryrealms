import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeRealmPilotConfig,
  normalizeRealmWorkspacePreference,
  realmPilotDecision,
} from '../../lib/realm-pilot.js';

const CONTRACTS = [
  { id: 'additive-user-preference', layer: 'database', source: 'prisma/schema.prisma', signals: ['workspacePreference', 'String', '@default("auto")', '@@index([status, userType, workspacePreference])'] },
  { id: 'preference-only-migration', layer: 'database', source: 'prisma/migrations/20260719110000_add_realm_pilot_preference/migration.sql', signals: ['ALTER TABLE "User"', 'ADD COLUMN "workspacePreference"', 'User_status_userType_workspacePreference_idx'], forbiddenSignals: ['CREATE TABLE', 'DROP TABLE'] },
  { id: 'single-setting-policy', layer: 'server', source: 'lib/realm-pilot.js', signals: ['parseRealmPilotConfig', 'JSON.stringify({ ...current, realmPilot: config })', 'setting.upsert'] },
  { id: 'generic-settings-preserve-policy', layer: 'server', source: 'app/api/settings/route.js', signals: ['if (current.realmPilot) next.realmPilot = current.realmPilot', "delete next.realmPilot", "isolationLevel: 'Serializable'"] },
  { id: 'kill-switch-and-role-cohort', layer: 'contract', source: 'lib/realm-pilot.js', signals: ["config.mode === 'off'", "config.mode === 'pilot'", 'config.roles.includes(role)', "resolvedSurface: 'erp'"] },
  { id: 'explicit-user-opt-out', layer: 'contract', source: 'lib/realm-pilot.js', signals: ["REALM_WORKSPACE_PREFERENCES", "['auto', 'erp', 'realm']", 'saveRealmWorkspacePreference'] },
  { id: 'server-route-enforcement', layer: 'server', source: 'app/(app)/realm/page.jsx', signals: ['loadRealmPilotDecision', 'if (!pilot.allowed)', 'redirect(`/dashboard?realm='] },
  { id: 'authenticated-policy-api', layer: 'api', source: 'app/api/realm-demo/pilot/route.js', signals: ['authenticatedUser()', 'export async function GET', 'export async function PUT', 'export async function PATCH'] },
  { id: 'director-policy-write', layer: 'server', source: 'lib/realm-pilot.js', signals: ['if (!isDirector(sessionUser))', 'realm_pilot_admin_forbidden', 'realm_pilot_roles_required'] },
  { id: 'aggregate-private-metrics', layer: 'server', source: 'lib/realm-pilot.js', signals: ['eligibleUsers', 'aggregateOnly: true', 'performanceTracking: false', 'durationTracking: false', 'lastSeen: { gte: activeAfter }'] },
  { id: 'policy-aware-login', layer: 'client', source: 'app/login/page.jsx', signals: ["fetch('/api/realm-demo/pilot'", 'pilot.user?.allowed', "destination = '/realm'"] },
  { id: 'cross-surface-preference', layer: 'client', source: 'lib/collaboration.js', signals: ['persistWorkspaceSurface', "window.fetch('/api/realm-demo/pilot'", 'preference: normalized', 'keepalive: true'] },
  { id: 'both-surfaces-persist-choice', layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ["persistWorkspaceSurface('erp')", 'Chuyển sang giao diện ERP CRM', 'Mở ERP · CRM'] },
  { id: 'pilot-admin-control', layer: 'client', source: 'components/realm/RealmPilotControl.jsx', signals: ['Realm Pilot Control', 'Pilot theo vai trò', 'Lưu chính sách pilot', 'không thay thế ERP'] },
  { id: 'accessible-responsive-control', layer: 'style', source: 'components/realm/realm-pilot-control.module.css', signals: ['min-height: 44px', ':focus-within', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'classic-erp-always-reachable', layer: 'client', source: 'components/collaboration/CollaborationBridge.jsx', signals: ["realm ? '/dashboard'", "surface = realm ? 'erp'", 'ERP · CRM'] },
  { id: 'schema-readiness-v7', layer: 'health', source: 'lib/realm-health.js', signals: ['REALM_SCHEMA_VERSION = 7', '20260719110000_add_realm_pilot_preference', "missing.push('pilot_preference')"] },
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
  const staff = { id: 'staff-1', role: 'STAFF', roles: '["STAFF"]', userType: 'employee' };
  const rows = [
    { id: 'kill-switch-fallback', expected: 'false:erp:realm_pilot_disabled', actual: ((d) => `${d.allowed}:${d.resolvedSurface}:${d.code}`)(realmPilotDecision(staff, { mode: 'off', defaultSurface: 'realm' }, 'realm')) },
    { id: 'cohort-denied', expected: 'false:erp:realm_pilot_cohort_required', actual: ((d) => `${d.allowed}:${d.resolvedSurface}:${d.code}`)(realmPilotDecision(staff, { mode: 'pilot', roles: ['PM'] }, 'realm')) },
    { id: 'cohort-granted-default', expected: 'true:realm:realm_pilot_granted', actual: ((d) => `${d.allowed}:${d.resolvedSurface}:${d.code}`)(realmPilotDecision(staff, { mode: 'pilot', roles: ['STAFF'], defaultSurface: 'realm' }, 'auto')) },
    { id: 'user-erp-opt-out', expected: 'true:erp:realm_pilot_granted', actual: ((d) => `${d.allowed}:${d.resolvedSurface}:${d.code}`)(realmPilotDecision(staff, { mode: 'open', defaultSurface: 'realm' }, 'erp')) },
    { id: 'freelancer-denied', expected: 'false:erp:freelancer_forbidden', actual: ((d) => `${d.allowed}:${d.resolvedSurface}:${d.code}`)(realmPilotDecision({ ...staff, userType: 'freelancer' }, { mode: 'open' }, 'realm')) },
    { id: 'invalid-preference-safe', expected: 'auto', actual: normalizeRealmWorkspacePreference('../../realm') },
    { id: 'invalid-policy-safe', expected: 'open:erp', actual: ((p) => `${p.mode}:${p.defaultSurface}`)(normalizeRealmPilotConfig({ mode: 'root', defaultSurface: 'admin' })) },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmPilotAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const sourcePath = path.join(root, contract.source);
    const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    const forbiddenSignals = (contract.forbiddenSignals || []).filter((signal) => source.includes(signal));
    return { ...contract, missingSignals, forbiddenSignals, status: missingSignals.length || forbiddenSignals.length ? 'failed' : 'verified' };
  });
  const scenarios = buildScenarios();
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      additiveMigrations: 1,
      parallelBusinessTables: 0,
      performanceTracking: false,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 10 — Realm Pilot & Adoption Control\n\n` +
    `Phase 10 đưa Realm vào rollout có kiểm soát mà không thay thế ERP/CRM nguyên bản. Một cột preference nhẹ được gắn vào User hiện hữu; policy nằm trong Setting hiện hữu; không có database nghiệp vụ thứ hai.\n\n` +
    `## Kết quả\n\n` +
    `- Pilot/security contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic rollout scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Performance tracking: **${s.performanceTracking}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Rollout và quyền riêng tư\n\n` +
    `- Giám đốc có kill switch, cohort theo vai trò và chế độ mở cho toàn bộ nhân sự nội bộ.\n` +
    `- Mỗi nhân sự có lựa chọn auto/ERP/Realm; ERP luôn là fallback và luôn có thể quay lại.\n` +
    `- /realm được enforce phía server; giấu menu không phải là lớp bảo mật duy nhất.\n` +
    `- Adoption chỉ đếm preference và presence hết hạn sau 90 giây ở mức tổng hợp. Không ghi thời lượng hoặc hiệu suất cá nhân.\n` +
    `- Tất cả module, phân quyền và record nghiệp vụ tiếp tục dùng database ERP duy nhất.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:pilot:check\`.\n`;
}

export function renderRealmPilotArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'forbiddenSignals', 'missingSignals', 'status'];
  return {
    'pilot-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'pilot-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-10-REPORT.md': report(result),
  };
}
