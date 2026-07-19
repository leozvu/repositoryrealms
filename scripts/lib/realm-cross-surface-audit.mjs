import fs from 'node:fs';
import path from 'node:path';
import { realmChangeDomains } from '../../lib/realm-change-feed.js';

const CONTRACTS = [
  { id: 'audience-schema', layer: 'database', source: 'prisma/schema.prisma', signals: ['audienceUserId String?', '@@index([audienceUserId, createdAt, id])'] },
  { id: 'additive-audience-migration', layer: 'database', source: 'prisma/migrations/20260718193000_add_realm_change_audience/migration.sql', signals: ['ADD COLUMN "audienceUserId" TEXT', 'RealmChangeEvent_audienceUserId_createdAt_id_idx'] },
  { id: 'session-audience-filter', layer: 'server', source: 'lib/realm-change-feed.js', signals: ["{ audienceUserId: user.id }", 'where: { AND: [audience, afterCursor] }'] },
  { id: 'payload-free-audience-feed', layer: 'server', source: 'lib/realm-change-feed.js', signals: ['select: { id: true, createdAt: true, domains: true }', 'domains: [...domainSet].sort()'] },
  { id: 'notification-create-wakeup', layer: 'server', source: 'lib/events.js', signals: ["resource: 'notifications', action: 'create', audienceUserId"] },
  { id: 'notification-read-wakeup', layer: 'api', source: 'app/api/notifications/route.js', signals: ["resource: 'notifications'", 'audienceUserId: user.id', "'Cache-Control': 'private, no-cache, no-store, max-age=0'"] },
  { id: 'collaboration-target-wakeup', layer: 'server', source: 'lib/collaboration-admin.js', signals: ["resource: 'collaboration', action: 'request'", 'audienceUserId: targetId'] },
  { id: 'message-recipient-wakeup', layer: 'api', source: 'app/api/chat/[id]/route.js', signals: ["resource: 'messages', action: 'create'", 'audienceUserId'] },
  { id: 'erp-live-counters', layer: 'client', source: 'components/Shell.jsx', signals: ['handleShellChanges', 'loadShellCounters', "domains.has(domain)"] },
  { id: 'realm-raven-inbox', layer: 'client', source: 'components/realm/RealmNotificationBell.jsx', signals: ['Raven Inbox', "fetch('/api/notifications'", 'dataRevision'] },
  { id: 'single-browser-event', layer: 'client', source: 'components/realm/useRealmChangeFeed.js', signals: ['REALM_CHANGE_BROWSER_EVENT', 'window.dispatchEvent(new CustomEvent'] },
  { id: 'instant-contact-refresh', layer: 'client', source: 'components/collaboration/CollaborationBridge.jsx', signals: ['REALM_CHANGE_BROWSER_EVENT', "includes('collaboration')", 'loadContacts()'] },
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
  return [
    { id: 'notification-domain', expected: 'notifications', actual: realmChangeDomains('notifications').join(',') },
    { id: 'message-domain', expected: 'communications', actual: realmChangeDomains('messages').join(',') },
    { id: 'collaboration-fanout', expected: 'collaboration,notifications,communications', actual: realmChangeDomains('collaboration').join(',') },
    { id: 'sensitive-resource-suppressed', expected: '', actual: realmChangeDomains('payroll').join(',') },
  ].map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmCrossSurfaceAudit(root) {
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
  return `# Phase 4 — Cross-surface Raven Inbox\n\n` +
    `Phase 4 nối notification, chat và lời mời cộng tác giữa ERP thuần với Realm bằng audience-scoped wake-up event. Notification API và database ERP vẫn là nguồn sự thật duy nhất.\n\n` +
    `## Kết quả\n\n` +
    `- Cross-surface contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive database migration: **1**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Privacy và vận hành\n\n` +
    `- Event dành riêng chỉ được query khi audienceUserId khớp session; event công ty vẫn dùng audience null.\n` +
    `- Feed chỉ trả domain tổng hợp, không trả audience, actor, notification text hoặc message content.\n` +
    `- ERP refresh badge/counter; Realm refresh Raven Inbox; cả hai đọc cùng /api/notifications.\n` +
    `- Contact banner được đánh thức ngay bởi browser event, còn polling 5/15 giây giữ vai trò fallback.\n` +
    `- Đánh dấu đã đọc phát wake-up targeted để các tab và hai giao diện hội tụ cùng trạng thái.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:cross-surface:check\`. Gate thất bại nếu audience filter, notification publisher, ERP counters, Raven Inbox hoặc contact refresh mất evidence.\n`;
}

export function renderRealmCrossSurfaceArtifacts(result) {
  return {
    'cross-surface-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'cross-surface-contracts.csv': contractsCsv(result),
    'PHASE-4-REPORT.md': `${report(result)}\n`,
  };
}
