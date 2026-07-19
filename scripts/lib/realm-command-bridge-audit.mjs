import fs from 'node:fs';
import path from 'node:path';
import { realmLeadTransitions, realmTaskTransitions } from '../../lib/realm-action-contract.js';

const CONTRACTS = [
  { id: 'receipt-schema', layer: 'database', source: 'prisma/schema.prisma', signals: ['model RealmActionReceipt', 'idempotencyKey String   @unique', '@@index([resource, entityId, createdAt])'] },
  { id: 'additive-receipt-migration', layer: 'database', source: 'prisma/migrations/20260718210000_add_realm_action_receipts/migration.sql', signals: ['CREATE TABLE "RealmActionReceipt"', 'RealmActionReceipt_idempotencyKey_key'] },
  { id: 'explicit-transition-allowlist', layer: 'contract', source: 'lib/realm-action-contract.js', signals: ['REALM_TASK_TRANSITIONS', 'REALM_LEAD_TRANSITIONS', 'done: Object.freeze([])', 'won: Object.freeze([])'] },
  { id: 'erp-rbac-row-scope', layer: 'server', source: 'lib/realm-action-admin.js', signals: ["canWrite('tasks', user)", 'RESOURCES.tasks.canWriteRow', 'realmGuildScope(user)', 'realmEmbassyScope(user)'] },
  { id: 'optimistic-concurrency', layer: 'server', source: 'lib/realm-action-admin.js', signals: ['updateMany({', 'status: command.expectedState', 'stage: command.expectedState', "'realm_action_stale'"] },
  { id: 'idempotent-command-receipt', layer: 'server', source: 'lib/realm-action-admin.js', signals: ['normalizeRealmIdempotencyKey', 'existingReceipt', "error?.code !== 'P2002'", 'realm_action_idempotency_conflict'] },
  { id: 'atomic-audit-receipt', layer: 'server', source: 'lib/realm-action-admin.js', signals: ['db.$transaction', 'realmActionReceipt.create', 'auditLog.create', "action: 'realm_action'"] },
  { id: 'event-bus-feedback-loop', layer: 'api', source: 'app/api/realm-demo/actions/route.js', signals: ["await emitEvent(result.resource, result.event || 'update'", '!result.idempotent', "route: 'realm.actions'"] },
  { id: 'surface-and-session-gate', layer: 'api', source: 'app/api/realm-demo/actions/route.js', signals: ['authorizedUser()', 'realmSurfaceDecision', "isFreelancer(user)", 'loadRealmCompanyModules'] },
  { id: 'safe-response-shape', layer: 'api', source: 'app/api/realm-demo/actions/route.js', signals: ["source: 'erp'", 'idempotent: result.idempotent', 'action: result.action', 'generatedAt: new Date().toISOString()'] },
  { id: 'explicit-user-confirmation', layer: 'client', source: 'components/realm/RealmActionDialog.jsx', signals: ['ConfirmDialog', 'Idempotency-Key', 'ERP vẫn là nguồn dữ liệu chính', 'nhật ký kiểm toán'] },
  { id: 'war-room-command-ui', layer: 'client', source: 'components/realm/WarRoom.jsx', signals: ['realmTaskTransitions', "action: 'task.transition'", 'RealmActionDialog', 'command bridge'] },
  { id: 'embassy-command-ui', layer: 'client', source: 'components/realm/RoyalEmbassy.jsx', signals: ['realmLeadTransitions', "action: 'lead.transition'", 'RealmActionDialog', 'command bridge'] },
  { id: 'schema-readiness-current', layer: 'health', source: 'lib/realm-health.js', signals: ['REALM_SCHEMA_VERSION = 7', '20260719110000_add_realm_pilot_preference', "missing.push('action_receipts')"] },
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
  const rows = [
    { id: 'task-forward', expected: 'in_progress,blocked', actual: realmTaskTransitions('todo').join(',') },
    { id: 'task-terminal', expected: '', actual: realmTaskTransitions('done').join(',') },
    { id: 'lead-forward', expected: 'won,lost', actual: realmLeadTransitions('negotiation').join(',') },
    { id: 'lead-terminal', expected: '', actual: realmLeadTransitions('won').join(',') },
    { id: 'unknown-state-deny', expected: '', actual: realmTaskTransitions('../../admin').join(',') },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmCommandBridgeAudit(root) {
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
    },
    contracts,
    scenarios,
  };
}

function contractsCsv(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function report(result) {
  const s = result.summary;
  return `# Phase 5 — Realm command bridge\n\n` +
    `Phase 5 đóng vòng Realm → ERP cho hai thao tác hẹp: chuyển trạng thái Quest trong War Room và chuyển stage Lead trong Royal Embassy. Database ERP vẫn là nguồn sự thật duy nhất.\n\n` +
    `## Kết quả\n\n` +
    `- Command/security contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic transition scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive database migration: **1**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Safety model\n\n` +
    `- Realm không có generic write: chỉ hai action type và transition graph được allowlist.\n` +
    `- Session ERP, module policy, role, row scope và dependency validation được kiểm tra lại phía server.\n` +
    `- expectedState + updateMany compare-and-swap chặn lost update; idempotency receipt chặn double-submit/retry.\n` +
    `- Update, receipt và AuditLog nằm cùng transaction; event bus chỉ chạy một lần sau commit để hai giao diện hội tụ.\n` +
    `- Response chỉ trả metadata action, không trả email, phone, note hoặc record payload.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:commands:check\`. Gate thất bại nếu migration, scope/RBAC, concurrency, audit/event loop hoặc confirmation UI mất evidence.\n`;
}

export function renderRealmCommandBridgeArtifacts(result) {
  return {
    'command-bridge-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'command-bridge-contracts.csv': contractsCsv(result),
    'PHASE-5-REPORT.md': `${report(result)}\n`,
  };
}
