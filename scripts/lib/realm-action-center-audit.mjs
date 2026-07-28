import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeRealmFollowupDraft,
  normalizeRealmTaskCommentDraft,
} from '../../lib/realm-action-contract.js';
import { realmChangeDomains } from '../../lib/realm-change-feed.js';

const CONTRACTS = [
  { id: 'receipt-extension', layer: 'database', source: 'prisma/schema.prisma', signals: ['model RealmActionReceipt', 'resultId', 'payloadHash'] },
  { id: 'additive-migration', layer: 'database', source: 'prisma/migrations/20260718230000_extend_realm_action_receipts/migration.sql', signals: ['ADD COLUMN "resultId"', 'ADD COLUMN "payloadHash"'] },
  { id: 'create-action-allowlist', layer: 'contract', source: 'lib/realm-action-admin.js', signals: ["'task.comment.create'", "'lead.followup.create'", 'const ACTIONS = new Set'] },
  { id: 'input-boundaries', layer: 'contract', source: 'lib/realm-action-contract.js', signals: ['REALM_FOLLOWUP_KINDS', 'normalizeRealmTaskCommentDraft', 'normalizeRealmFollowupDraft'] },
  { id: 'payload-free-receipt', layer: 'server', source: 'lib/realm-action-admin.js', signals: ["createHash('sha256')", 'payloadHash: command.payloadHash', 'resultId: created.id'] },
  { id: 'task-comment-scope', layer: 'server', source: 'lib/realm-action-admin.js', signals: ["canWrite('taskcomments', user)", 'taskInScope(task, user)', "resource: 'taskcomments'"] },
  { id: 'lead-followup-scope', layer: 'server', source: 'lib/realm-action-admin.js', signals: ["canWrite('activities', user)", 'leadInScope(lead, user)', "refType: 'lead'"] },
  { id: 'atomic-create-audit', layer: 'server', source: 'lib/realm-action-admin.js', signals: ['tx.taskComment.create', 'tx.activity.create', 'createAuditData', 'tx.realmActionReceipt.create'] },
  { id: 'safe-action-response', layer: 'api', source: 'app/api/realm-demo/actions/route.js', signals: ['action: result.action', "source: 'erp'", 'result.event ||'] },
  { id: 'cross-surface-event', layer: 'server', source: 'lib/realm-change-feed.js', signals: ["activities: ['embassy']", "taskcomments: ['operations', 'campaigns']"] },
  { id: 'erp-notification', layer: 'server', source: 'lib/events.js', signals: ["resource === 'taskcomments'", 'bình luận việc', 'await notify(task.assigneeId', "resource === 'activities'", 'lên lịch follow-up'] },
  { id: 'war-room-permission', layer: 'server', source: 'lib/realm-war-room-admin.js', signals: ["canWrite('taskcomments', user)", 'canComment: commentWriteAllowed'] },
  { id: 'embassy-permission', layer: 'server', source: 'lib/realm-embassy-admin.js', signals: ["canWrite('activities', user)", 'canFollowUp: followupWriteAllowed'] },
  { id: 'action-composer', layer: 'client', source: 'components/realm/RealmCreateActionDialog.jsx', signals: ['War Council note', 'Diplomatic follow-up', 'Idempotency-Key', 'Gửi War Council note', 'Lập Diplomatic follow-up', 'RepositoryRealms'] },
  { id: 'war-room-entrypoint', layer: 'client', source: 'components/realm/WarRoom.jsx', signals: ["action: 'task.comment.create'", 'Ghi chú War Council', 'RealmCreateActionDialog'] },
  { id: 'embassy-entrypoint', layer: 'client', source: 'components/realm/RoyalEmbassy.jsx', signals: ["action: 'lead.followup.create'", 'Lên lịch follow-up', 'RealmCreateActionDialog'] },
  { id: 'schema-readiness-v8', layer: 'health', source: 'lib/realm-health.js', signals: ['REALM_SCHEMA_VERSION = 8', '20260719133000_add_realm_pilot_feedback'] },
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
    { id: 'comment-normalization', expected: 'Quyết định\nmới', actual: normalizeRealmTaskCommentDraft('  Quyết định\r\nmới  ') },
    { id: 'followup-kind-allowlist', expected: 'meeting', actual: normalizeRealmFollowupDraft({ kind: 'MEETING' }).kind },
    { id: 'followup-kind-deny', expected: '', actual: normalizeRealmFollowupDraft({ kind: 'visit' }).kind },
    { id: 'comment-domain-fanout', expected: 'operations,campaigns', actual: realmChangeDomains('taskcomments').join(',') },
    { id: 'activity-domain-isolation', expected: 'embassy', actual: realmChangeDomains('activities').join(',') },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmActionCenterAudit(root) {
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
  return `# Phase 6 — Dual-surface Action Center\n\n` +
    `Phase 6 nối cộng tác hằng ngày giữa giao diện Realms và ERP nguyên bản bằng hai thao tác additive: War Council note trên Task và Diplomatic follow-up trên Lead.\n\n` +
    `## Kết quả\n\n` +
    `- Action Center contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic privacy/sync scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive database migration: **1**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Safety model\n\n` +
    `- ERP vẫn là nguồn sự thật: comment là TaskComment thật, follow-up là Activity CRM thật.\n` +
    `- Action allowlist, role/module và row scope được kiểm tra lại phía server; không có generic mutation.\n` +
    `- Receipt chỉ lưu hash SHA-256 và result ID; nội dung comment/title không bị sao chép sang receipt hoặc audit.\n` +
    `- Transaction ghi record + receipt + audit; event bus sau commit kích hoạt notification và change-feed cho cả hai giao diện.\n` +
    `- Assignment được hoãn có chủ ý để ERP tiếp tục quản lý workload và quyền PM/Lead.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:action-center:check\`.\n`;
}

export function renderRealmActionCenterArtifacts(result) {
  return {
    'action-center-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'action-center-contracts.csv': contractsCsv(result),
    'PHASE-6-REPORT.md': `${report(result)}\n`,
  };
}
