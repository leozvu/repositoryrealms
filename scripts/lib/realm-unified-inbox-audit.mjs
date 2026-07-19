import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeNotificationRoute,
  notificationRecordRoute,
  notificationRouteMeta,
} from '../../lib/notification-inbox.js';
import { realmChangeDomains } from '../../lib/realm-change-feed.js';
import { createRealmWarRoomDashboard } from '../../lib/realm-war-room.js';
import { createRealmEmbassyDashboard } from '../../lib/realm-embassy.js';

const CONTRACTS = [
  { id: 'single-notification-source', layer: 'database', source: 'prisma/schema.prisma', signals: ['model Notification', '@@index([userId, createdAt])', '@@index([userId, readAt])'] },
  { id: 'private-inbox-query', layer: 'api', source: 'app/api/notifications/route.js', signals: ['where: { userId: user.id }', 'rows.map(normalizeNotificationRow)', 'PRIVATE_HEADERS'] },
  { id: 'scoped-read-state', layer: 'api', source: 'app/api/notifications/route.js', signals: ['id: notificationId, userId: user.id, readAt: null', 'changed: result.count', 'audienceUserId: user.id'] },
  { id: 'safe-route-contract', layer: 'contract', source: 'lib/notification-inbox.js', signals: ['normalizeNotificationRoute', "route.startsWith('//')", 'notificationRecordRoute', 'normalizeNotificationRow'] },
  { id: 'exact-record-notifications', layer: 'server', source: 'lib/events.js', signals: ["notificationRecordRoute('tasks'", "notificationRecordRoute('leads'", "notificationRecordRoute('tickets'"] },
  { id: 'exact-approval-notifications', layer: 'server', source: 'lib/approvals.js', signals: ["notificationRecordRoute('approvals', ap.id)"] },
  { id: 'erp-inbox-shared-sync', layer: 'client', source: 'components/Shell.jsx', signals: ['Raven Inbox · Thông báo ERP', 'NOTIFICATION_SYNC_EVENT', "fetch('/api/notifications'"] },
  { id: 'realm-inbox-shared-sync', layer: 'client', source: 'components/realm/RealmNotificationBell.jsx', signals: ['NOTIFICATION_SYNC_EVENT', 'window.setInterval(refresh, 15_000)', 'aria-labelledby', 'closePanel'] },
  { id: 'approval-deep-link-consumer', layer: 'client', source: 'app/(app)/approvals/page.jsx', signals: ["get('focus')", 'scrollIntoView', 'data-inbox-focus'] },
  { id: 'ticket-deep-link-consumer', layer: 'client', source: 'app/(app)/tickets/page.jsx', signals: ["get('focus')", "setModal({ mode: 'edit', row: ticket })"] },
  { id: 'scoped-war-council-history', layer: 'server', source: 'lib/realm-war-room-admin.js', signals: ['taskId: { in: tasks.map', 'commentsByTask', 'comments.length < 3'] },
  { id: 'war-council-timeline-ui', layer: 'client', source: 'components/realm/WarRoom.jsx', signals: ['War Council gần đây', 'task.comments.map', 'dateTime={comment.createdAt'] },
  { id: 'scoped-diplomatic-history', layer: 'server', source: 'lib/realm-embassy-admin.js', signals: ["where: { refType: 'lead'", 'activitiesByLead', 'select: { id: true, refId: true, kind: true, title: true, date: true, done: true, userId: true }'] },
  { id: 'diplomatic-timeline-ui', layer: 'client', source: 'components/realm/RoyalEmbassy.jsx', signals: ['Diplomatic log', 'lead.activities.map', 'activity.author'] },
  { id: 'accessible-responsive-inbox', layer: 'style', source: 'components/realm/realm-notification-bell.module.css', signals: ['min-height: 44px', ':focus-visible', '@media (max-width: 390px)', '@media (prefers-reduced-motion: reduce)'] },
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
  const war = createRealmWarRoomDashboard({
    project: { id: 'project-1', name: 'Campaign' },
    tasks: [{ id: 'task-1', title: 'Quest', comments: [{ id: 'comment-1', content: 'Quyết định', createdAt: '2026-07-18T10:00:00.000Z', author: { name: 'Lan' }, secret: 'hidden' }] }],
  });
  const embassy = createRealmEmbassyDashboard({
    leads: [{ id: 'lead-1', company: 'Lumen', activities: [{ id: 'activity-1', kind: 'call', title: 'Gọi lại', date: '2026-07-19', author: { name: 'Quang' }, note: 'hidden' }] }],
  });
  const comment = war.phases[0].tasks[0].comments[0];
  const activity = embassy.stages.find((stage) => stage.id === 'new').leads[0].activities[0];
  const rows = [
    { id: 'external-route-denied', expected: '/messages', actual: normalizeNotificationRoute('//evil.example/path') },
    { id: 'task-route-metadata', expected: 'quest:Task ERP', actual: `${notificationRouteMeta('/tasks?focus=task-1').kind}:${notificationRouteMeta('/tasks?focus=task-1').targetLabel}` },
    { id: 'approval-deep-link', expected: '/approvals?focus=approval-1&from=notification', actual: notificationRecordRoute('approvals', 'approval-1') },
    { id: 'notification-feed-domain', expected: 'notifications', actual: realmChangeDomains('notifications').join(',') },
    { id: 'comment-serializer-privacy', expected: 'false', actual: String('secret' in comment) },
    { id: 'activity-serializer-privacy', expected: 'false', actual: String('note' in activity) },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmUnifiedInboxAudit(root) {
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
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 7 — Unified Raven Inbox & record timelines\n\n` +
    `Phase 7 hợp nhất thông báo giữa ERP nguyên bản và Realms trên cùng bảng Notification, cùng read/unread state và cùng deep-link bản ghi. War Council và Diplomatic log chỉ là góc nhìn mới trên TaskComment/Activity ERP hiện hữu.\n\n` +
    `## Kết quả\n\n` +
    `- Unified inbox contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic privacy/routing scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Database migration: **${s.databaseMigrations}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Data and privacy model\n\n` +
    `- Không tạo inbox hoặc timeline riêng cho game: ERP vẫn là nguồn sự thật duy nhất.\n` +
    `- GET/PUT Notification luôn khóa theo currentUser; read/unread được phát qua change-feed tới đúng audience.\n` +
    `- Internal route được chuẩn hóa; Task, Lead, Ticket và Approval mở đúng record nếu người dùng còn quyền.\n` +
    `- War Room chỉ đọc comment của Task đã qua Guild scope; Embassy chỉ đọc Activity của Lead đã qua CRM scope.\n` +
    `- Diplomatic log không trả note, contact detail hoặc field ngoài allowlist.\n` +
    `- Không đổi schema, không chạm database production và không tạo dữ liệu nghiệp vụ song song.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:inbox:check\`.\n`;
}

export function renderRealmUnifiedInboxArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'unified-inbox-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'unified-inbox-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-7-REPORT.md': `${report(result)}\n`,
  };
}
