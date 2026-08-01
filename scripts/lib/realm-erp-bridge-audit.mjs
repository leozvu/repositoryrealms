import fs from 'node:fs';
import path from 'node:path';
import { ERP_NAV_ITEMS } from '../../lib/erp-navigation.js';
import {
  REALM_ERP_BRIDGE_CATALOG,
  buildRealmQuestLinks,
  realmRecordHref,
  unresolvedRealmBridgeMappings,
} from '../../lib/realm-business-bridge.js';

const RECORD_FLOWS = [
  { id: 'quest-snapshot', realm: 'Quest', erp: 'Task', source: 'lib/realm-erp-adapter.js', signals: ['links: buildRealmQuestLinks(task, accessContext)'], target: '/tasks?focus=:id' },
  { id: 'quest-board', realm: 'Quest Board', erp: 'Task detail', source: 'components/realm/RealmOffice.jsx', signals: ["quest.links?.task || realmRecordHref('task'"], target: '/tasks?focus=:id' },
  { id: 'task-focus', realm: 'Realm deep-link', erp: 'Task modal', source: 'app/(app)/tasks/page.jsx', signals: ["get('focus')", "setModal({ mode: 'edit', row: task })"], target: 'TaskDetailModal' },
  { id: 'guild-member', realm: 'Guild member', erp: 'Staff profile', source: 'components/realm/RealmOffice.jsx', signals: ["realmRecordHref('staff', member.id)"], target: '/staff/:id' },
  { id: 'war-room-task', realm: 'War Room Task', erp: 'Task detail', source: 'components/realm/WarRoom.jsx', signals: ['onOpenTask', 'Mở Task ERP'], target: '/tasks?focus=:id' },
  { id: 'war-room-project', realm: 'Campaign', erp: 'Project detail', source: 'components/realm/RealmOffice.jsx', signals: ["realmRecordHref('project', selectedCampaign?.id)"], target: '/projects/:id' },
  { id: 'embassy-lead', realm: 'Embassy opportunity', erp: 'Lead detail', source: 'components/realm/RoyalEmbassy.jsx', signals: ['onOpenLead', 'Mở Lead ERP'], target: '/leads?focus=:id' },
  { id: 'lead-focus', realm: 'Realm deep-link', erp: 'Lead modal', source: 'app/(app)/leads/page.jsx', signals: ["get('focus')", "setModal({ mode: 'edit', row: lead })"], target: 'Lead FormModal' },
  { id: 'embassy-client', realm: 'Embassy alliance', erp: 'Client detail', source: 'components/realm/RoyalEmbassy.jsx', signals: ['onOpenClient', 'Mở Client ERP'], target: '/clients/:id' },
  { id: 'global-search', realm: 'Shared ERP and Realm search', erp: 'Exact record', source: 'lib/global-search-contract.js', signals: ["realmRecordHref('lead'", "realmRecordHref('task'", "realmRecordHref('project'", "realmRecordHref('staff'"], target: 'record-aware routes' },
];

const BROWSER_SCENARIOS = [
  { id: 'portal-registry', route: '/realm-demo', evidence: 'Sổ nhân vật hiển thị 7 cổng lõi với medieval label và route ERP nguyên bản.' },
  { id: 'deep-link-auth', route: '/tasks?focus=task-demo&from=realm', evidence: 'Anonymous deep-link chuyển về login; record ERP không bị lộ.' },
  { id: 'responsive-bridge', route: '/realm-demo', evidence: 'Viewport mobile không overflow; portal card cao 64px, vượt touch target tối thiểu 44px.' },
  { id: 'browser-console', route: '/realm-demo', evidence: 'Không có browser warning/error trong các scenario Phase 4.' },
];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownTable(rows, columns) {
  const clean = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${columns.map(([label]) => label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${columns.map(([, key]) => clean(row[key])).join(' | ')} |`),
  ].join('\n');
}

export function buildRealmErpBridgeAudit(root) {
  const routeRows = REALM_ERP_BRIDGE_CATALOG.map((mapping) => {
    const routeFile = `app/(app)/${mapping.key}/page.jsx`;
    return {
      ...mapping,
      roles: mapping.roles.join(' | ') || 'DIRECTOR only',
      routeFile,
      routeExists: fs.existsSync(path.join(root, routeFile)),
      status: mapping.mapped && fs.existsSync(path.join(root, routeFile)) ? 'verified' : 'failed',
    };
  });
  const recordFlows = RECORD_FLOWS.map((flow) => {
    const filePath = path.join(root, flow.source);
    const source = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const missingSignals = flow.signals.filter((signal) => !source.includes(signal));
    return { ...flow, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const taskLinks = buildRealmQuestLinks({ id: 'task-demo', project: { id: 'project-demo' }, assignee: { id: 'staff-demo' } });
  const linkContracts = [
    ['task', taskLinks.task, '/tasks?focus=task-demo&from=realm'],
    ['project', taskLinks.project, '/projects/project-demo'],
    ['staff', taskLinks.owner, '/staff/staff-demo'],
    ['lead', realmRecordHref('lead', 'lead-demo'), '/leads?focus=lead-demo&from=realm'],
    ['client', realmRecordHref('client', 'client-demo'), '/clients/client-demo'],
  ].map(([kind, actual, expected]) => ({ kind, actual, expected, status: actual === expected ? 'verified' : 'failed' }));
  const navKeys = new Set(ERP_NAV_ITEMS.map((item) => item.key));
  const mappingKeys = new Set(REALM_ERP_BRIDGE_CATALOG.map((item) => item.key));
  const catalogDrift = [...new Set([...navKeys, ...mappingKeys])].filter((key) => navKeys.has(key) !== mappingKeys.has(key));
  return {
    schemaVersion: 1,
    summary: {
      erpNavigationRoutes: ERP_NAV_ITEMS.length,
      mappedNavigationRoutes: routeRows.filter((row) => row.mapped).length,
      verifiedNavigationRoutes: routeRows.filter((row) => row.status === 'verified').length,
      recordFlows: recordFlows.length,
      verifiedRecordFlows: recordFlows.filter((flow) => flow.status === 'verified').length,
      linkContracts: linkContracts.length,
      verifiedLinkContracts: linkContracts.filter((contract) => contract.status === 'verified').length,
      unresolvedMappings: unresolvedRealmBridgeMappings().length,
      catalogDrift: catalogDrift.length,
      browserScenarios: BROWSER_SCENARIOS.length,
    },
    routeMappings: routeRows,
    recordFlows,
    linkContracts,
    catalogDrift,
    browserScenarios: BROWSER_SCENARIOS,
  };
}

export function bridgeMatrixCsv(result) {
  const columns = ['key', 'group', 'realmLabel', 'realmSurface', 'erpLabel', 'href', 'roles', 'module', 'routeFile', 'status'];
  return `${columns.map(csvCell).join(',')}\n${result.routeMappings.map(row => columns.map(column => csvCell(row[column])).join(',')).join('\n')}\n`;
}

export function phase4ReportMarkdown(result) {
  const s = result.summary;
  const flows = result.recordFlows.map((flow) => ({ ...flow, evidence: flow.signals.join(' + ') }));
  return `# Phase 4 — Realm ↔ ERP/CRM business bridge\n\n` +
    `Phase 4 giữ ERP/CRM làm nguồn sự thật duy nhất và biến lớp medieval thành một cách điều hướng/hiển thị khác, không tạo bản ghi nghiệp vụ song song.\n\n` +
    `## Kết quả\n\n` +
    `- Primary ERP navigation routes: **${s.erpNavigationRoutes}**\n` +
    `- Routes có medieval mapping: **${s.mappedNavigationRoutes}/${s.erpNavigationRoutes}**\n` +
    `- Route files được xác minh: **${s.verifiedNavigationRoutes}/${s.erpNavigationRoutes}**\n` +
    `- Record-level bridge flows: **${s.verifiedRecordFlows}/${s.recordFlows}**\n` +
    `- Link contracts: **${s.verifiedLinkContracts}/${s.linkContracts}**\n` +
    `- Unresolved mappings: **${s.unresolvedMappings}**\n` +
    `- Navigation catalog drift: **${s.catalogDrift}**\n\n` +
    `## Nguyên tắc kiến trúc\n\n` +
    `- Menu ERP và ma trận Realm dùng chung \`lib/erp-navigation.js\`; không nhân đôi route/role/module trong component.\n` +
    `- Medieval label chỉ đổi ngôn ngữ trình bày. API, Prisma, RBAC và dữ liệu vẫn là ERP gốc.\n` +
    `- Quest, Campaign, Guild member, Lead và Client mở đúng record gốc; không dừng ở trang danh sách.\n` +
    `- Deep-link Task/Lead tự mở modal đúng ID và báo lỗi nếu record không còn tồn tại hoặc vượt quyền.\n\n` +
    `## Record-level flows\n\n${markdownTable(flows, [['Flow', 'id'], ['Realm', 'realm'], ['ERP target', 'erp'], ['Target', 'target'], ['Status', 'status'], ['Evidence', 'evidence']])}\n\n` +
    `## Browser scenarios\n\n${markdownTable(result.browserScenarios, [['Scenario', 'id'], ['Route', 'route'], ['Evidence', 'evidence']])}\n\n` +
    `## Regression gate\n\n` +
    `Chạy \`npm run audit:realm:bridge:check\`. Gate thất bại khi ERP navigation có route chưa map, route file mất, deep-link contract sai, record flow thiếu evidence hoặc artifact Phase 4 bị stale.\n`;
}

export function renderRealmErpBridgeArtifacts(result) {
  return {
    'bridge-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'bridge-matrix.csv': bridgeMatrixCsv(result),
    'PHASE-4-REPORT.md': `${phase4ReportMarkdown(result)}\n`,
  };
}
