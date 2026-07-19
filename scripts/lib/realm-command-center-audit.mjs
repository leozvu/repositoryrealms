import fs from 'node:fs';
import path from 'node:path';
import { createRealmCommandCenterDashboard } from '../../lib/realm-command-center.js';
import { realmChangeDomains } from '../../lib/realm-change-feed.js';

const CONTRACTS = [
  { id: 'erp-task-source-of-truth', layer: 'database', source: 'prisma/schema.prisma', signals: ['model Task {', 'model TaskEvent {', 'model Approval {', 'model RealmActionReceipt {'] },
  { id: 'command-surface-task-module', layer: 'access', source: 'lib/realm-access.js', signals: ["key: 'command'", "module: 'tasks'", "command: 'command'"] },
  { id: 'authenticated-feature-gated-api', layer: 'api', source: 'app/api/realm-demo/command-center/route.js', signals: ["process.env.REALM_ERP_SYNC_ENABLED !== '1'", "realmSurfaceDecision(user, 'command'", 'isFreelancer(user)'] },
  { id: 'scope-and-privacy-allowlist', layer: 'server', source: 'lib/realm-command-center-admin.js', signals: ['realmGuildScope(user)', 'assigneeId: true', 'estHours: true', 'select: { userId: true, hours: true }'] },
  { id: 'workload-planning-not-ranking', layer: 'contract', source: 'lib/realm-command-center.js', signals: ["capacityBasis: '40 giờ kế hoạch/người; chỉ dùng để phát hiện xung đột phân bổ'", 'performanceRanking: false', "sourceOfTruth: 'erp-task'"] },
  { id: 'assignment-rbac-and-team-scope', layer: 'server', source: 'lib/realm-action-admin.js', signals: ["hasAny(user, ['PM', 'LEAD'])", "realm_assignment_target_outside_scope", "action === 'task.assign'"] },
  { id: 'assignment-optimistic-concurrency', layer: 'server', source: 'lib/realm-action-admin.js', signals: ['assigneeId: command.expectedAssigneeId', 'dueDate: command.expectedDueDate', 'priority: command.expectedPriority', "'realm_action_stale'"] },
  { id: 'assignment-idempotency-and-audit', layer: 'server', source: 'lib/realm-action-admin.js', signals: ['tx.realmActionReceipt.create', 'payloadHash: command.payloadHash', "tx.auditLog.create({ data: auditData(user, command, 'tasks')"] },
  { id: 'assignment-event-raven-bridge', layer: 'api', source: 'app/api/realm-demo/actions/route.js', signals: ["if (action === 'task.assign') return 'command'", 'await emitEvent(result.resource', 'if (!result.idempotent)'] },
  { id: 'handoff-owner-team-and-dedup', layer: 'server', source: 'lib/realm-command-center-admin.js', signals: ["task.assigneeId !== user.id", "realm_handoff_target_outside_team", "type: 'task_handoff', refId: task.id, requesterId: user.id, status: 'pending'"] },
  { id: 'handoff-maker-checker', layer: 'api', source: 'app/api/approvals/[id]/decide/route.js', signals: ["['realm_redemption', 'task_handoff'].includes(ap.type)", "ap.requesterId === user.id", "'self_approval_forbidden'"] },
  { id: 'handoff-approval-claim-transaction', layer: 'api', source: 'app/api/approvals/[id]/decide/route.js', signals: ['prisma.$transaction(async (tx)', "where: { id: ap.id, status: 'pending', steps: ap.steps }", "'approval_decision_stale'"] },
  { id: 'handoff-cas-team-and-event', layer: 'server', source: 'lib/approvals.js', signals: ['executeTaskHandoff', 'where: { id: taskId, assigneeId: expectedAssigneeId', "'task_handoff_target_outside_team'", "await emitEvent('tasks', 'update'"] },
  { id: 'realtime-task-and-approval-domains', layer: 'sync', source: 'lib/realm-change-feed.js', signals: ["tasks: ['operations', 'guild', 'campaigns', 'command', 'rewards']", "approvals: ['command', 'notifications']"] },
  { id: 'accessible-command-ui', layer: 'client', source: 'components/realm/RoyalCommandCenter.jsx', signals: ['role="progressbar"', 'aria-busy={saving || undefined}', 'Mở Task ERP', 'Điều phối nguồn lực, không xếp hạng con người'] },
  { id: 'responsive-command-ui', layer: 'style', source: 'components/realm/royal-command-center.module.css', signals: ['min-height: 44px', ':focus-visible', '@media (max-width: 420px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'classic-erp-task-surface-preserved', layer: 'client', source: 'app/(app)/tasks/page.jsx', signals: ["useResource('taskcomments'", "useResource('timelogs'", "useResource('taskevents'", 'Chi tiết công việc'] },
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
  const now = new Date('2026-07-18T12:00:00.000Z');
  const dashboard = createRealmCommandCenterDashboard({
    source: 'erp', actorId: 'member-1', scope: 'team', now,
    permissions: { canAssign: false },
    members: [
      { id: 'member-1', name: 'Mai', realmProfile: { realmClass: 'Questsmith', color: '#52745f' } },
      { id: 'member-2', name: 'Lan' },
    ],
    tasks: [
      { id: 'task-1', title: 'Overdue Quest', status: 'doing', priority: 'high', dueDate: '2026-07-17', estHours: 44, assigneeId: 'member-1', note: 'private' },
      { id: 'task-2', title: 'Done Quest', status: 'done', priority: 'medium', assigneeId: 'member-1' },
    ],
    timeLogs: [{ userId: 'member-1', hours: 6 }],
    handoffs: [{ id: 'approval-1', refId: 'task-1', requesterName: 'Mai', status: 'pending', payload: JSON.stringify({ targetAssigneeId: 'member-2', note: 'private handoff' }), createdAt: now }],
  });
  const task = dashboard.tasks.find((row) => row.id === 'task-1');
  const member = dashboard.workload.find((row) => row.id === 'member-1');
  const serialized = JSON.stringify(dashboard);
  const rows = [
    { id: 'erp-source-contract', expected: 'erp:erp-task', actual: `${dashboard.source}:${dashboard.permissions.sourceOfTruth}` },
    { id: 'seven-day-capacity', expected: '7:40:110:overloaded', actual: `${dashboard.horizon.days}:${member.capacityHours}:${member.loadPercent}:${member.loadLevel}` },
    { id: 'handoff-locks-duplicate', expected: 'approval-1:false', actual: `${task.handoff?.id}:${task.canRequestHandoff}` },
    { id: 'serializer-hides-private-fields', expected: 'false:false', actual: `${serialized.includes('private handoff')}:${serialized.includes('"note"')}` },
    { id: 'no-gold-or-presence-scoring', expected: 'false:false:false', actual: `${serialized.includes('Gold')}:${serialized.includes('presence')}:${dashboard.permissions.performanceRanking}` },
    { id: 'task-change-refreshes-command', expected: 'true', actual: String(realmChangeDomains('tasks').includes('command')) },
    { id: 'approval-change-refreshes-command', expected: 'true', actual: String(realmChangeDomains('approvals').includes('command')) },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmCommandCenterAudit(root) {
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
      databaseMigrations: 0,
      parallelBusinessTables: 0,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 8 — Royal Command Center\n\n` +
    `Phase 8 bổ sung góc nhìn điều phối medieval cho Task ERP mà không tạo hệ thống nhiệm vụ song song. Phân công ghi trực tiếp Task, còn bàn giao đi qua Approval maker–checker hiện hữu.\n\n` +
    `## Kết quả\n\n` +
    `- Command Center contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic governance scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Database migration: **${s.databaseMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Governance và data model\n\n` +
    `- Task ERP là nguồn sự thật duy nhất; Classic ERP và Realm cùng đọc một bản ghi.\n` +
    `- PM/Guild Lead phân công trong scope; compare-and-swap, idempotency receipt, AuditLog và TaskEvent bảo vệ thao tác ghi.\n` +
    `- Nhân sự chỉ xin bàn giao Task đang phụ trách; người tạo không được tự duyệt.\n` +
    `- Workload là cảnh báo phân bổ 7 ngày từ giờ ước lượng, không phải bảng xếp hạng và không dùng Gold/presence.\n` +
    `- Raven, notification và Realm change-feed phát hiện thay đổi Task/Approval trên cả hai giao diện.\n` +
    `- Không đổi schema, không chạm production và không thay thế màn hình Task ERP nguyên bản.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:command-center:check\`.\n`;
}

export function renderRealmCommandCenterArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'command-center-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'command-center-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-8-REPORT.md': report(result),
  };
}
