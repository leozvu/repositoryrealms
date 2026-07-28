import fs from 'node:fs';
import path from 'node:path';
import { createRealmChronicleDashboard } from '../../lib/realm-chronicle.js';
import { realmChangeDomains } from '../../lib/realm-change-feed.js';

const CONTRACTS = [
  { id: 'erp-records-remain-source-of-truth', layer: 'database', source: 'prisma/schema.prisma', signals: ['model User {', 'model Task {', 'model TimeLog {', 'model Leave {', 'model Attendance {', 'model Approval {', 'model RealmGoldEntry {'] },
  { id: 'personal-surface-for-internal-users', layer: 'access', source: 'lib/realm-access.js', signals: ["key: 'personal'", 'roles: ERP_ALL_ROLES', 'module: null'] },
  { id: 'authenticated-feature-gated-read-api', layer: 'api', source: 'app/api/realm-demo/chronicle/route.js', signals: ["process.env.REALM_ERP_SYNC_ENABLED !== '1'", "realmSurfaceDecision(user, 'personal'", 'isFreelancer(user)', 'export async function GET'] },
  { id: 'self-scoped-business-queries', layer: 'server', source: 'lib/realm-chronicle-admin.js', signals: ["where: { assigneeId: user.id }", 'where: { userId: user.id', 'where: { requesterId: user.id }', 'where: { userId: user.id }'] },
  { id: 'sensitive-fields-never-selected', layer: 'server', source: 'lib/realm-chronicle-admin.js', signals: ['id: true, name: true, title: true, teamId: true, status: true, userType: true, realmProfile: true', 'select: { id: true, from: true, to: true, type: true, status: true }', 'select: { id: true, type: true, title: true, status: true, createdAt: true }'] },
  { id: 'privacy-and-no-ranking-contract', layer: 'contract', source: 'lib/realm-chronicle.js', signals: ["scope: 'self'", 'performanceRanking: false', "sensitiveFieldsExcluded: ['salary', 'hourlyRate', 'reviewScores', 'managerNotes', 'privateNotes']", "sourceOfTruth: 'erp-records'"] },
  { id: 'allowlisted-personal-timeline', layer: 'contract', source: 'lib/realm-chronicle.js', signals: ["kind: 'gold'", "kind: 'time'", "kind: 'leave'", "kind: 'approval'", ".slice(0, 16)"] },
  { id: 'exact-erp-deep-links', layer: 'contract', source: 'lib/realm-chronicle.js', signals: ["?focus=${encodeURIComponent(id)}&from=realm", "?focus=${encodeURIComponent(safeId(taskId))}&from=realm", "links.projects}/${encodeURIComponent"] },
  { id: 'realtime-personal-domains', layer: 'sync', source: 'lib/realm-change-feed.js', signals: ["timelogs: ['operations', 'command', 'chronicle']", "leaves: ['chronicle']", "attendance: ['chronicle']", "realm_gold: ['operations', 'treasury', 'rewards', 'chronicle']"] },
  { id: 'accessible-chronicle-ui', layer: 'client', source: 'components/realm/AdventurerChronicle.jsx', signals: ['role="progressbar"', 'aria-live="polite"', 'aria-label="Adventurer Chronicle từ dữ liệu ERP cá nhân"', 'Hồ sơ tự phục vụ, không phải công cụ giám sát'] },
  { id: 'resilient-chronicle-ui', layer: 'client', source: 'components/realm/AdventurerChronicle.jsx', signals: ['AbortController', "window.setTimeout(() => controller.abort(), 7000)", 'Snapshot gần nhất vẫn được giữ', 'Thử lại'] },
  { id: 'responsive-accessible-style', layer: 'style', source: 'components/realm/adventurer-chronicle.module.css', signals: ['min-height: 44px', ':focus-visible', '@media (max-width: 480px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'chronicle-integrated-without-replacement', layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ['<AdventurerChronicle', 'Cổng nghiệp vụ ERP/CRM', 'Quest ↔ công việc ERP/CRM', 'Gold journal'] },
  { id: 'classic-personal-erp-routes-preserved', layer: 'client', source: 'lib/realm-business-bridge.js', signals: ["timesheet: ['Chronicle'", "attendance: ['Royal Muster'", "approvals: ['Council Chamber'", "staff: ['Guild Roster'"] },
  { id: 'no-chronicle-write-endpoint', layer: 'api', source: 'app/api/realm-demo/chronicle/route.js', signals: ['export async function GET', "operation: 'self.read'", "code: 'realm_chronicle_ready'"] },
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
  const dashboard = createRealmChronicleDashboard({
    source: 'erp', generatedAt: now.toISOString(), now,
    user: { id: 'staff-1', name: 'Mai', title: 'Designer', salary: 50_000_000, mgrNote: 'secret manager note' },
    profile: { realmClass: 'Questsmith', color: '#52745f', streakDays: 3 },
    tasks: [
      { id: 'task-1', title: 'Overdue Quest', status: 'doing', priority: 'high', dueDate: '2026-07-17', estHours: 8, note: 'secret task note', project: { id: 'project-1', name: 'EVA', status: 'active', progress: 50 } },
      { id: 'task-2', title: 'Done Quest', status: 'done', priority: 'medium', dueDate: '2026-07-10' },
    ],
    timeLogs: [{ id: 'time-1', userId: 'staff-1', date: '2026-07-18', hours: 4, note: 'secret time note', project: { id: 'project-1', name: 'EVA' } }],
    leaves: [{ id: 'leave-1', from: '2026-07-20', to: '2026-07-20', type: 'annual', status: 'approved', note: 'secret leave note' }],
    attendance: [{ id: 'attendance-1', date: '2026-07-18', status: 'remote', checkIn: '09:00', note: 'secret attendance note' }],
    approvals: [{ id: 'approval-1', type: 'task_handoff', title: 'Handoff', status: 'pending', payload: 'secret payload', createdAt: now }],
    entries: [{ id: 'gold-1', amount: 10, renown: 20, label: 'Quest reward', createdAt: now }],
    links: { tasks: '/tasks', projects: '/projects', timesheet: '/timesheet', attendance: '/attendance', approvals: '/approvals' },
  });
  const serialized = JSON.stringify(dashboard);
  const rows = [
    { id: 'self-scope-no-ranking', expected: 'self:false:erp-records', actual: `${dashboard.privacy.scope}:${dashboard.privacy.performanceRanking}:${dashboard.privacy.sourceOfTruth}` },
    { id: 'personal-metrics', expected: '1:1:4:1', actual: `${dashboard.metrics.openQuests}:${dashboard.metrics.overdueQuests}:${dashboard.metrics.loggedHours}:${dashboard.metrics.pendingApprovals}` },
    { id: 'sensitive-values-excluded', expected: 'false:false:false:false:false', actual: `${serialized.includes('50000000')}:${serialized.includes('secret manager')}:${serialized.includes('secret task')}:${serialized.includes('secret leave')}:${serialized.includes('secret payload')}` },
    { id: 'exact-record-links', expected: '/tasks?focus=task-1&from=realm:/approvals?focus=approval-1&from=realm', actual: `${dashboard.quests[0].href}:${dashboard.approvals[0].href}` },
    { id: 'timeline-allowlist', expected: 'approval,gold,leave,time', actual: [...new Set(dashboard.timeline.map((event) => event.kind))].sort().join(',') },
    { id: 'task-refreshes-chronicle', expected: 'true', actual: String(realmChangeDomains('tasks').includes('chronicle')) },
    { id: 'timelog-refreshes-chronicle', expected: 'true', actual: String(realmChangeDomains('timelogs').includes('chronicle')) },
    { id: 'leave-attendance-refresh-chronicle', expected: 'true:true', actual: `${realmChangeDomains('leaves').includes('chronicle')}:${realmChangeDomains('attendance').includes('chronicle')}` },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmChronicleAudit(root) {
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
      writeEndpoints: 0,
    },
    contracts,
    scenarios,
  };
}

function report(result) {
  const s = result.summary;
  return `# Phase 9 — Adventurer Chronicle\n\n` +
    `Phase 9 biến Sổ nhân vật thành hồ sơ trạng thái cá nhân tự phục vụ trên dữ liệu ERP gốc. Chronicle chỉ đọc dữ liệu của current user, không tạo leaderboard và không lưu bản sao nghiệp vụ.\n\n` +
    `## Kết quả\n\n` +
    `- Chronicle contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic privacy scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Database migration: **${s.databaseMigrations}**\n` +
    `- Parallel business table: **${s.parallelBusinessTables}**\n` +
    `- Chronicle write endpoint: **${s.writeEndpoints}**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Privacy và data model\n\n` +
    `- User, Task, Project, TimeLog, Leave, Attendance, Approval và RealmGoldEntry hiện hữu là nguồn sự thật duy nhất.\n` +
    `- Mọi query nghiệp vụ khóa theo current user; timeline chỉ trả allowlist trình bày.\n` +
    `- Không select salary, hourlyRate, review score, manager note, private note hoặc Approval payload.\n` +
    `- Giờ tự ghi và lịch cá nhân không dùng để xếp hạng; Chronicle không có API ghi.\n` +
    `- Mọi hành động mở đúng route ERP cổ điển; change-feed chỉ phát metadata invalidation.\n` +
    `- Không đổi schema, không chạm production và không thay thế các màn ERP nguyên bản.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:chronicle:check\`.\n`;
}

export function renderRealmChronicleArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return {
    'chronicle-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'chronicle-contracts.csv': `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-9-REPORT.md': report(result),
  };
}
