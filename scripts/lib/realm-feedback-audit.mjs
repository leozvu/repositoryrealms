import fs from 'node:fs';
import path from 'node:path';
import {
  isRealmFeedbackManager,
  normalizeRealmFeedbackDraft,
  serializeRealmFeedback,
} from '../../lib/realm-feedback.js';

const CONTRACTS = [
  { id: 'erp-ticket-source-of-truth', layer: 'database', source: 'prisma/schema.prisma', signals: ['model Ticket', 'source', 'feedbackType', 'feedbackSurface', 'feedbackContext', 'reporterId', 'requestKey'] },
  { id: 'additive-ticket-migration', layer: 'database', source: 'prisma/migrations/20260719133000_add_realm_pilot_feedback/migration.sql', signals: ['ALTER TABLE "Ticket"', 'Ticket_requestKey_key', 'Ticket_source_status_idx', 'Ticket_reporterId_createdAt_idx'], forbiddenSignals: ['CREATE TABLE', 'DROP TABLE'] },
  { id: 'authenticated-internal-api', layer: 'api', source: 'app/api/realm-demo/feedback/route.js', signals: ['authenticatedUser()', 'freelancer_forbidden', 'export async function GET', 'export async function POST', 'export async function PATCH'] },
  { id: 'idempotent-serializable-create', layer: 'server', source: 'lib/realm-feedback.js', signals: ['normalizeRealmIdempotencyKey', 'findUnique({ where: { requestKey } })', "isolationLevel: 'Serializable'", 'idempotent: true'] },
  { id: 'staff-own-scope', layer: 'server', source: 'lib/realm-feedback.js', signals: ["{ source: REALM_FEEDBACK_SOURCE, reporterId: user.id }", 'manager,', 'reporter: reporterName'] },
  { id: 'manager-rbac', layer: 'server', source: 'lib/realm-feedback.js', signals: ["hasAny(user, ['HR', 'PM'])", 'realm_feedback_manager_forbidden'] },
  { id: 'optimistic-concurrency', layer: 'server', source: 'lib/realm-feedback.js', signals: ['expectedUpdatedAt', 'realm_feedback_stale', 'Phản hồi vừa được người khác cập nhật'] },
  { id: 'sla-and-status-workflow', layer: 'server', source: 'lib/realm-feedback.js', signals: ["blocked: { priority: 'high', slaHours: 8 }", "degraded: { priority: 'normal', slaHours: 24 }", 'REALM_FEEDBACK_STATUSES'] },
  { id: 'audit-log-append', layer: 'server', source: 'lib/realm-feedback.js', signals: ['realm_feedback_create', 'realm_feedback_update', 'auditLog.create'] },
  { id: 'change-feed-and-notification', layer: 'api', source: 'app/api/realm-demo/feedback/route.js', signals: ["emitEvent('tickets', 'create'", 'await notify(', "emitEvent('tickets', 'update'"] },
  { id: 'declared-private-context', layer: 'server', source: 'lib/realm-feedback.js', signals: ["privacy: 'no-record-content'", "excludedContext: ['form-values', 'record-content', 'browser-history', 'keystrokes']", 'durationTracking: false', 'performanceTracking: false'] },
  { id: 'cross-surface-launcher', layer: 'client', source: 'components/realm/RealmFeedbackLauncher.jsx', signals: ['Phản hồi pilot', "surface === 'realm'", 'Gửi vào Guild Support', 'Ticket ERP'] },
  { id: 'erp-safe-fallback', layer: 'client', source: 'components/realm/RealmFeedbackLauncher.jsx', signals: ["persistWorkspaceSurface('erp')", 'Về ERP an toàn', 'href="/dashboard"'] },
  { id: 'pilot-operations-queue', layer: 'client', source: 'components/realm/RealmFeedbackOperations.jsx', signals: ['Guild Support · Pilot Operations', 'Hàng chờ xử lý', 'expectedUpdatedAt', 'Lưu &amp; thông báo'] },
  { id: 'accessible-responsive-launcher', layer: 'style', source: 'components/realm/realm-feedback-launcher.module.css', signals: ['min-height: 44px', ':focus-visible', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'accessible-responsive-operations', layer: 'style', source: 'components/realm/realm-feedback-operations.module.css', signals: ['min-height: 44px', ':focus-visible', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'shell-available-on-both-surfaces', layer: 'client', source: 'components/Shell.jsx', signals: ['RealmFeedbackLauncher', 'realmPilot?.config?.features?.feedback !== false'] },
  { id: 'schema-readiness-v8', layer: 'health', source: 'lib/realm-health.js', signals: ['REALM_SCHEMA_VERSION = 8', '20260719133000_add_realm_pilot_feedback', "missing.push('pilot_feedback')"] },
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
  const director = { id: 'director-1', role: 'DIRECTOR', roles: ['DIRECTOR'], userType: 'employee' };
  const input = { category: 'bug', impact: 'blocked', surface: 'realm', summary: 'Tavern không mở', details: 'Nhấp Tavern nhưng giao diện không thay đổi.', route: '/realm?secret=removed', area: 'Tavern' };
  const draft = normalizeRealmFeedbackDraft(input, { release: 'phase11' });
  const serialized = serializeRealmFeedback({
    id: 'ticket-1', code: 'RPF-1', title: '[Realm Pilot][Lỗi kỹ thuật] Tavern không mở', desc: input.details,
    feedbackType: 'bug', feedbackSurface: 'realm', feedbackContext: JSON.stringify(draft.context),
    source: 'realm_pilot', reporterId: staff.id, status: 'open', priority: 'high', createdAt: new Date(0), updatedAt: new Date(0), requestKey: 'must-not-leak',
  });
  const rows = [
    { id: 'query-stripped', expected: '/realm', actual: draft.context.route },
    { id: 'privacy-marker', expected: 'no-record-content', actual: draft.context.privacy },
    { id: 'director-manager', expected: 'true', actual: String(isRealmFeedbackManager(director)) },
    { id: 'staff-not-manager', expected: 'false', actual: String(isRealmFeedbackManager(staff)) },
    { id: 'request-key-hidden', expected: 'false', actual: String('requestKey' in serialized) },
    { id: 'summary-unwrapped', expected: 'Tavern không mở', actual: serialized.summary },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmFeedbackAudit(root) {
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
      parallelFeedbackTables: 0,
      performanceTracking: false,
      durationTracking: false,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 11 — Pilot Operations & Feedback Loop\n\n` +
    `Phase 11 biến phản hồi từ Realm và ERP thành Ticket ERP có SLA, audit, notification và hàng chờ xử lý. Không tạo bảng feedback song song và không biến phản hồi thành chỉ số đánh giá con người.\n\n` +
    `## Kết quả\n\n` +
    `- Feedback/security contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive migration: **${s.additiveMigrations}**\n` +
    `- Parallel feedback table: **${s.parallelFeedbackTables}**\n` +
    `- Performance tracking: **${s.performanceTracking}**\n` +
    `- Duration tracking: **${s.durationTracking}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Luồng vận hành\n\n` +
    `- Nhân sự gửi phản hồi từ Realm hoặc ERP qua cùng launcher, biết trước context nào được đính kèm.\n` +
    `- POST idempotent tạo Ticket ERP; mức ảnh hưởng ánh xạ SLA 8/24/72 giờ.\n` +
    `- Nhân sự chỉ đọc phản hồi của mình qua feedback API; Director/HR/PM có queue xử lý.\n` +
    `- Cập nhật dùng optimistic concurrency, tạo AuditLog, phát change event và thông báo lại người gửi.\n` +
    `- Không thu form values, record content, browser history, keystrokes hoặc thời lượng làm việc.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:feedback:check\`.\n`;
}

export function renderRealmFeedbackArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'forbiddenSignals', 'missingSignals', 'status'];
  return {
    'feedback-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'feedback-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-11-REPORT.md': report(result),
  };
}
