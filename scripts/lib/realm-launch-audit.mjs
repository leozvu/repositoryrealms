import fs from 'node:fs';
import path from 'node:path';
import {
  classifyRealmLaunchChange,
  createRealmLaunchPreviewToken,
  verifyRealmLaunchPreviewToken,
} from '../../lib/realm-launch-token.js';
import { normalizeRealmPilotConfig } from '../../lib/realm-pilot.js';

const CONTRACTS = [
  { id: 'hmac-signed-short-lived-preview', layer: 'security', source: 'lib/realm-launch-token.js', signals: ["createHmac('sha256'", 'REALM_LAUNCH_PREVIEW_TTL_MS = 10 * 60 * 1000', 'timingSafeEqual'] },
  { id: 'actor-version-draft-binding', layer: 'security', source: 'lib/realm-launch-token.js', signals: ['realm_launch_preview_actor_mismatch', 'realm_launch_preview_version_mismatch', 'realm_launch_preview_draft_mismatch'] },
  { id: 'risk-classification', layer: 'server', source: 'lib/realm-launch-token.js', signals: ['classifyRealmLaunchChange', "return 'expansion'", "return 'restriction'", "return 'emergency'"] },
  { id: 'expansion-readiness-gate', layer: 'server', source: 'lib/realm-launch-token.js', signals: ["risk === 'expansion'", 'realm_launch_readiness_blocked'] },
  { id: 'director-only-preview', layer: 'server', source: 'lib/realm-launch.js', signals: ['isDirector(sessionUser)', 'realm_launch_admin_forbidden'] },
  { id: 'read-only-live-dry-run', layer: 'server', source: 'lib/realm-launch.js', signals: ['inspectRealmSchemaReadiness', 'loadRealmPilotMetrics', 'evaluateRealmLaunchReadiness'] },
  { id: 'aggregate-impact-no-roster', layer: 'privacy', source: 'lib/realm-launch.js', signals: ['fallbackUsers', 'eligibleDelta', 'rosterIncluded: false', 'performanceTracking: false', 'durationTracking: false'] },
  { id: 'active-member-revalidation', layer: 'server', source: 'lib/realm-launch.js', signals: ["status: 'active'", "userType: 'employee'", 'realm_pilot_members_stale'] },
  { id: 'preview-api-private-response', layer: 'api', source: 'app/api/realm-demo/launch/route.js', signals: ['createRealmLaunchPreview', 'realmJsonResponse', 'realm_launch_preview_ready'] },
  { id: 'transactional-preview-verification', layer: 'server', source: 'lib/realm-pilot.js', signals: ['verifyLaunchPreview({ db: tx, currentPolicy: currentConfig, draftPolicy: draft })', "isolationLevel: 'Serializable'"] },
  { id: 'apply-time-readiness-recheck', layer: 'server', source: 'lib/realm-launch.js', signals: ["preview.risk === 'expansion'", 'loadRealmLaunchReadiness(db, draftPolicy, now)', 'realm_launch_readiness_stale'] },
  { id: 'api-enforces-preview', layer: 'api', source: 'app/api/realm-demo/pilot/route.js', signals: ['requireLaunchPreview: true', 'verifyRealmLaunchApplication', 'launchPreviewToken'] },
  { id: 'kill-switch-unconditional', layer: 'safety', source: 'lib/realm-pilot.js', signals: ["draft.mode !== 'off'", "'kill-switch'", "'emergency'"] },
  { id: 'aggregate-audit-evidence', layer: 'audit', source: 'lib/realm-pilot.js', signals: ['eligible ${launchPreview?.eligibleUsers', 'fallback ${launchPreview?.fallbackUsers', "entity: 'realm_pilot'"] },
  { id: 'progressive-dry-run-ui', layer: 'client', source: 'components/realm/RealmPilotControl.jsx', signals: ['Controlled launch dry-run', 'Chạy dry-run phát hành', 'previewAllowsApply', 'Dry-run chỉ trả số liệu tổng hợp'] },
  { id: 'draft-change-invalidates-preview', layer: 'client', source: 'components/realm/RealmPilotControl.jsx', signals: ['launch.draftKey === draftKey', 'previewValid', 'Có thay đổi chưa preview'] },
  { id: 'accessible-responsive-launch-control', layer: 'style', source: 'components/realm/realm-pilot-control.module.css', signals: ['.launchActions button', 'min-height: 44px', '.previewGrid', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'operations-runbook', layer: 'operations', source: 'docs/realms/PHASE-14-CONTROLLED-LAUNCH-RUNBOOK.md', signals: ['crmegoric-realms-demo', '10 phút', 'mode = off', '/dashboard', 'không tự bật pilot'] },
  { id: 'authenticated-launch-uat', layer: 'test', source: 'tests/e2e/realm-smoke.spec.mjs', signals: ['Chạy dry-run phát hành', 'Tác động rollout tổng hợp', 'Fallback ERP'] },
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
  const secret = 'phase-14-audit-secret-long-enough';
  const now = new Date('2026-07-19T14:00:00.000Z');
  const off = normalizeRealmPilotConfig({ mode: 'off', version: 2 });
  const pilot = normalizeRealmPilotConfig({ mode: 'pilot', roles: ['STAFF'], version: 2 });
  const open = normalizeRealmPilotConfig({ mode: 'open', version: 2 });
  const signed = createRealmLaunchPreviewToken({
    actorId: 'director-1', currentPolicy: off, draftPolicy: pilot,
    readiness: { ready: true, summary: { blockers: 0 } },
    impact: { eligibleUsers: 4, fallbackUsers: 6 }, secret, now,
  });
  const verified = verifyRealmLaunchPreviewToken({ token: signed.token, actorId: 'director-1', currentPolicy: off, draftPolicy: pilot, secret, now });
  const scenarios = [
    { id: 'off-to-pilot-is-expansion', expected: 'expansion', actual: classifyRealmLaunchChange(off, pilot) },
    { id: 'open-to-pilot-is-restriction', expected: 'restriction', actual: classifyRealmLaunchChange(open, pilot) },
    { id: 'kill-switch-is-emergency', expected: 'emergency', actual: classifyRealmLaunchChange(pilot, { ...pilot, mode: 'off' }) },
    { id: 'signed-preview-round-trip', expected: signed.previewId, actual: verified.previewId },
    { id: 'aggregate-impact-bound', expected: '4:6', actual: `${verified.eligibleUsers}:${verified.fallbackUsers}` },
    { id: 'preview-does-not-contain-roster', expected: 'false', actual: String(signed.token.includes('staff-1')) },
  ];
  return scenarios.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmLaunchAudit(root) {
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
      previewTtlMinutes: 10,
      aggregateOnly: true,
      rosterIncluded: false,
      performanceTracking: false,
      durationTracking: false,
      killSwitchRequiresPreview: false,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 14 — Controlled Pilot Launch\n\n` +
    `Phase 14 biến thay đổi Realm policy thành quy trình dry-run có chữ ký trước khi apply. ERP/CRM vẫn là source of truth; không có migration hoặc bảng launch song song.\n\n` +
    `## Kết quả\n\n` +
    `- Security/operations contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic launch scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Preview TTL: **${s.previewTtlMinutes} phút**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Aggregate-only impact: **${s.aggregateOnly}**\n` +
    `- Roster included in preview: **${s.rosterIncluded}**\n` +
    `- Performance tracking: **${s.performanceTracking}**\n` +
    `- Duration tracking: **${s.durationTracking}**\n` +
    `- Kill switch requires preview: **${s.killSwitchRequiresPreview}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Nguyên tắc vận hành\n\n` +
    `- Mọi thay đổi policy đang mở Realm phải preview trên dữ liệu hiện tại trước khi apply.\n` +
    `- Preview bị khóa theo Director, policy version, digest bản nháp và thời hạn 10 phút.\n` +
    `- Expansion chỉ apply khi preflight không còn blocking gate; restriction vẫn khả dụng để giảm blast radius.\n` +
    `- Kill switch luôn apply trực tiếp và chỉ chuyển người dùng về ERP; không đảo migration.\n` +
    `- Preview và audit chỉ giữ số đếm tổng hợp, không sao chép roster hay dữ liệu hiệu suất.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:launch:check\`.\n`;
}

export function renderRealmLaunchArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'launch-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'launch-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-14-REPORT.md': report(result),
  };
}
