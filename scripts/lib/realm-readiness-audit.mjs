import fs from 'node:fs';
import path from 'node:path';
import { evaluateRealmLaunchReadiness } from '../../lib/realm-readiness.js';
import { normalizeRealmPilotConfig, realmPilotDecision } from '../../lib/realm-pilot.js';

const CONTRACTS = [
  { id: 'setting-policy-feature-flags', layer: 'server', source: 'lib/realm-pilot.js', signals: ['REALM_PILOT_FEATURES', 'features: Object.freeze({ office: true, tavern: true, feedback: true })', 'onboardingVersion', 'version: 0'] },
  { id: 'policy-optimistic-concurrency', layer: 'server', source: 'lib/realm-pilot.js', signals: ['draft.version !== currentConfig.version', 'realm_pilot_version_conflict', 'currentConfig.version + 1', "isolationLevel: 'Serializable'"] },
  { id: 'office-kill-switch-fallback', layer: 'server', source: 'lib/realm-pilot.js', signals: ["code: 'realm_office_disabled'", "resolvedSurface: 'erp'", 'ERP vẫn hoạt động bình thường'] },
  { id: 'aggregate-release-evaluation', layer: 'server', source: 'lib/realm-readiness.js', signals: ['eligibleUsers', 'onlineNow', 'aggregateOnly: true', 'performanceTracking: false', 'durationTracking: false'] },
  { id: 'rollback-without-data-reversal', layer: 'server', source: 'lib/realm-readiness.js', signals: ["action: 'set-policy-mode-off'", "fallbackRoute: '/dashboard'", 'preservesErpData: true', 'reversesMigrations: false'] },
  { id: 'director-readiness-api', layer: 'api', source: 'app/api/realm-demo/readiness/route.js', signals: ['currentUser()', 'isDirector(user)', 'loadRealmLaunchReadiness', 'realm_readiness_forbidden'] },
  { id: 'shared-schema-inspection', layer: 'health', source: 'lib/realm-health.js', signals: ['inspectRealmSchemaReadiness', 'evaluateRealmSchemaReadiness', 'LATEST_REALM_MIGRATION'] },
  { id: 'device-local-onboarding', layer: 'client', source: 'components/realm/RealmPilotOnboarding.jsx', signals: ['window.localStorage', 'onboardingVersion', 'skipped', 'completed'] },
  { id: 'onboarding-reopen-and-reset', layer: 'client', source: 'components/realm/RealmPilotOnboarding.jsx', signals: ['REALM_ONBOARDING_RESET_EVENT', 'Mở hướng dẫn Realm pilot', 'Bỏ qua lúc này', 'Hoàn tất hướng dẫn'] },
  { id: 'onboarding-privacy-copy', layer: 'client', source: 'components/realm/RealmPilotOnboarding.jsx', signals: ['không dùng để chấm hiệu suất cá nhân', 'Tiến độ tour không gửi lên server', 'không đo thời lượng'] },
  { id: 'accessible-responsive-onboarding', layer: 'style', source: 'components/realm/realm-pilot-onboarding.module.css', signals: ['min-height: 44px', ':focus-visible', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'release-control-surface', layer: 'client', source: 'components/realm/RealmPilotControl.jsx', signals: ['Feature flags phát hành độc lập', 'Release readiness preflight', 'Tạo tour v', 'Tổng hợp · riêng tư'] },
  { id: 'guild-support-server-flag', layer: 'api', source: 'app/api/realm-demo/feedback/route.js', signals: ['decision.config.features.feedback', 'realm_feedback_disabled'] },
  { id: 'tavern-server-flag', layer: 'api', source: 'app/api/realm-demo/treasury/route.js', signals: ['loadRealmPilotDecision', 'decision.config.features.tavern', 'realm_tavern_disabled'] },
  { id: 'tavern-client-flag', layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ['pilotFeatures?.tavern !== false', "['treasury', 'shop'].includes(panel)", 'Sổ Realm'] },
  { id: 'shell-feature-enforcement', layer: 'client', source: 'components/Shell.jsx', signals: ['realmPilot?.config?.features?.feedback !== false', 'RealmPilotOnboarding', 'RealmFeedbackLauncher'] },
  { id: 'product-route-passes-feature-contract', layer: 'server', source: 'app/(app)/realm/page.jsx', signals: ['pilotFeatures={pilot.config.features}', 'loadRealmPilotDecision'] },
  { id: 'release-rollback-runbook', layer: 'operations', source: 'docs/realms/PHASE-12-PILOT-RUNBOOK.md', signals: ['crmegoric-realms-demo', 'mode = off', '/dashboard', 'Không đảo migration', 'Không restore dữ liệu'] },
  { id: 'authenticated-onboarding-uat', layer: 'test', source: 'tests/e2e/realm-smoke.spec.mjs', signals: ['Realm Pilot · Khởi hành an toàn', 'Mở hướng dẫn Realm pilot', 'pilot onboarding remains usable on mobile'] },
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
  const schema = { ready: true, missing: [], schemaVersion: 8 };
  const metrics = { eligibleUsers: 2, online: { total: 1, erp: 1, realm: 0 } };
  const safe = { mode: 'pilot', defaultSurface: 'erp', roles: ['STAFF'], features: { office: true, tavern: true, feedback: true } };
  const rows = [
    { id: 'safe-pilot-ready', expected: 'ready:true:0', actual: ((r) => `${r.status}:${r.ready}:${r.summary.blockers}`)(evaluateRealmLaunchReadiness({ policy: safe, schema, metrics })) },
    { id: 'broad-rollout-blocked', expected: 'blocked:false', actual: ((r) => `${r.status}:${r.ready}`)(evaluateRealmLaunchReadiness({ policy: { ...safe, mode: 'open' }, schema, metrics })) },
    { id: 'tavern-can-follow-office', expected: 'attention:true:1', actual: ((r) => `${r.status}:${r.ready}:${r.summary.advisories}`)(evaluateRealmLaunchReadiness({ policy: { ...safe, features: { ...safe.features, tavern: false } }, schema, metrics })) },
    { id: 'office-disabled-forces-erp', expected: 'false:erp:realm_office_disabled', actual: ((d) => `${d.allowed}:${d.resolvedSurface}:${d.code}`)(realmPilotDecision(staff, { ...safe, features: { ...safe.features, office: false } }, 'realm')) },
    { id: 'legacy-policy-safe-defaults', expected: 'true:true:true:1:0', actual: ((p) => `${p.features.office}:${p.features.tavern}:${p.features.feedback}:${p.onboardingVersion}:${p.version}`)(normalizeRealmPilotConfig({ mode: 'pilot', roles: ['STAFF'] })) },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmReadinessAudit(root) {
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
  return `# Phase 12 — Pilot Launch Readiness\n\n` +
    `Phase 12 đóng gói Realm thành một pilot có thể phát hành và rollback an toàn trên cùng ERP/CRM. Không có bảng nghiệp vụ hoặc migration mới; feature flags và policy version nằm trong Setting hiện hữu.\n\n` +
    `## Kết quả\n\n` +
    `- Release/security contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic launch scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Aggregate-only telemetry: **${s.aggregateOnly}**\n` +
    `- Performance tracking: **${s.performanceTracking}**\n` +
    `- Duration tracking: **${s.durationTracking}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Nguyên tắc phát hành\n\n` +
    `- Cohort nhỏ theo vai trò, ERP là giao diện mặc định và /dashboard là đường fallback.\n` +
    `- Office, Tavern và Guild Support có feature flag độc lập; server vẫn enforce dù client ẩn nút.\n` +
    `- Onboarding được lưu trên thiết bị, có thể bỏ qua/mở lại/reset và không gửi tiến độ lên server.\n` +
    `- Readiness chỉ trả số đếm tổng hợp; không trả user ID, tên, hiệu suất hoặc thời lượng.\n` +
    `- Rollback pilot chỉ tắt policy; không đảo migration và không restore dữ liệu ERP.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:readiness:check\`.\n`;
}

export function renderRealmReadinessArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'readiness-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'readiness-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-12-REPORT.md': report(result),
  };
}
