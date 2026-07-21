import { ERP_NAV_ITEMS } from './erp-navigation.js';
import { createRealmAccessManifest, realmRouteDecision } from './realm-access.js';

const SAFE_RECORD_ID = /^[a-zA-Z0-9:_-]{1,100}$/;

// Medieval label chỉ là lớp trình bày. erpLabel/href/roles/module luôn lấy từ
// catalog ERP gốc để Realm không tạo ra một hệ thống nghiệp vụ thứ hai.
const MEDIEVAL_META = {
  realm: ['Cổng Realm', 'Vương quốc', 'Trải nghiệm'],
  dashboard: ['Royal Briefing', 'Đại sảnh', 'Tổng quan'],
  myday: ['Nhật trình', 'Bàn phiêu lưu', 'Tổng quan'],
  guide: ['Codex', 'Thư viện', 'Tổng quan'],
  install: ['Travel Rune', 'Cổng di động', 'Tổng quan'],
  calendar: ['Royal Calendar', 'Phòng lịch', 'Tổng quan'],
  messages: ['Lantern Mail', 'Tavern', 'Tổng quan'],
  approvals: ['Council Chamber', 'Phòng hội đồng', 'Tổng quan'],
  copilot: ['Oracle', 'Tháp tiên tri', 'Tổng quan'],
  leads: ['Royal Embassy', 'Đại sứ quán', 'CRM'],
  clients: ['Alliance Registry', 'Đại sứ quán', 'CRM'],
  quotes: ['Royal Proposals', 'Văn phòng hiệp ước', 'CRM'],
  services: ['Merchant Codex', 'Khu chợ', 'CRM'],
  tickets: ['Petition Board', 'Trạm hỗ trợ', 'CRM'],
  portfolio: ['Campaign Command', 'War Room', 'Vận hành'],
  projects: ['War Room', 'Phòng chiến dịch', 'Vận hành'],
  tasks: ['Quest Board', 'Đại sảnh', 'Vận hành'],
  teamwork: ['Guild Orchestrator', 'Phòng điều phối', 'Vận hành'],
  timesheet: ['Chronicle', 'Đài thời gian', 'Vận hành'],
  gantt: ['Campaign Map', 'War Room', 'Vận hành'],
  templates: ['Campaign Blueprints', 'Xưởng kế hoạch', 'Vận hành'],
  resources: ['Guild Capacity', 'Guild Hall', 'Vận hành'],
  invoices: ['Royal Invoices', 'Kho bạc', 'Tài chính'],
  commissions: ['Bounty Ledger', 'Kho bạc', 'Tài chính'],
  finance: ['Royal Ledger', 'Kho bạc', 'Tài chính'],
  finplan: ['Treasury Forecast', 'Đài quan sát', 'Tài chính'],
  fxreval: ['Currency Alchemy', 'Sàn đổi tiền', 'Tài chính'],
  vendors: ['Merchant Guild', 'Khu chợ', 'Tài chính'],
  contracts: ['Treaty Vault', 'Kho hiệp ước', 'Tài chính'],
  staff: ['Guild Roster', 'Guild Hall', 'Nhân sự'],
  attendance: ['Royal Muster', 'Cổng thành', 'Nhân sự'],
  payroll: ['Payroll Chest', 'Kho bạc', 'Nhân sự'],
  recruitment: ['Recruitment Hall', 'Guild Hall', 'Nhân sự'],
  reviews: ['Growth Chronicle', 'Phòng cố vấn', 'Nhân sự'],
  freelancers: ['Mercenary Guild', 'Guild Hall', 'Nhân sự'],
  growing: ['Royal Provinces', 'Bản đồ lãnh địa', 'Xuất nhập khẩu'],
  inventory: ['Warehouse Vault', 'Kho hàng', 'Xuất nhập khẩu'],
  shipments: ['Caravan Registry', 'Bến vận tải', 'Xuất nhập khẩu'],
  markets: ['Foreign Market Atlas', 'Đại sứ quán', 'Xuất nhập khẩu'],
  live: ['Broadcast Stage', 'Đấu trường', 'Livestream'],
  violations: ['Discipline Ledger', 'Phòng giám sát', 'Livestream'],
  assets: ['Royal Armory', 'Kho tài sản', 'Công ty'],
  import: ['Data Portal', 'Cổng dữ liệu', 'Công ty'],
  reports: ['Royal Reports', 'Đài quan sát', 'Công ty'],
  financials: ['Treasury Statements', 'Kho bạc', 'Công ty'],
  analytics: ['Scrying Observatory', 'Đài quan sát', 'Công ty'],
  okr: ['Guild Objectives', 'Bảng mục tiêu', 'Công ty'],
  automation: ['Arcane Automation', 'Tháp cơ khí', 'Công ty'],
  audit: ['Royal Chronicle', 'Kho lưu trữ', 'Công ty'],
  'ceo-overview': ['Royal Realm Overview', 'Phòng điều hành CEO', 'Công ty'],
  'ceo-world': ['Realm Federation Atlas', 'Bản đồ bốn vương quốc', 'Công ty'],
  'ceo-commands': ['Royal Dispatch', 'Phòng điều hành CEO', 'Công ty'],
  'ceo-inbox': ['Royal Courier', 'Hộp thư liên công ty', 'Công ty'],
  settings: ['Realm Governance', 'Phòng quản trị', 'Công ty'],
  'ceo-registry': ['Realm Registry', 'Phòng điều hành CEO', 'Công ty'],
  'ceo-security': ['Realm Security Vault', 'An toàn & khôi phục CEO', 'Công ty'],
  'ceo-rollout': ['Realm Rollout Keep', 'Pilot & phát hành CEO', 'Công ty'],
};

export const REALM_ERP_BRIDGE_CATALOG = ERP_NAV_ITEMS.map((item) => {
  const [realmLabel, realmSurface, group] = MEDIEVAL_META[item.key] || [];
  return {
    key: item.key,
    erpLabel: item.label,
    realmLabel: realmLabel || item.label,
    realmSurface: realmSurface || 'ERP Portal',
    group: group || 'ERP',
    href: `/${item.key}`,
    icon: item.icon,
    roles: item.roles,
    module: item.mod || null,
    mapped: Boolean(realmLabel && realmSurface && group),
  };
});

const PORTAL_KEYS = new Set(['myday', 'tasks', 'projects', 'calendar', 'messages', 'approvals', 'staff']);

export const REALM_CORE_PORTALS = REALM_ERP_BRIDGE_CATALOG.filter((item) => PORTAL_KEYS.has(item.key));

export function normalizeRealmRecordId(value) {
  const id = String(value ?? '').trim();
  return SAFE_RECORD_ID.test(id) ? id : null;
}

export function realmRecordHref(kind, value) {
  const id = normalizeRealmRecordId(value);
  const roots = { task: '/tasks', project: '/projects', staff: '/staff', lead: '/leads', client: '/clients' };
  const root = roots[kind] || '/dashboard';
  if (!id) return root;
  if (kind === 'task' || kind === 'lead') return `${root}?focus=${encodeURIComponent(id)}&from=realm`;
  if (kind === 'project' || kind === 'staff' || kind === 'client') return `${root}/${encodeURIComponent(id)}`;
  return root;
}

export function buildRealmQuestLinks(task, { user, modules = null, demo = false } = {}) {
  // Calls từ fixture Phase 4 không truyền actor được xem như demo. Snapshot ERP
  // thật luôn truyền session user và không đi qua nhánh tương thích này.
  const linkDemo = demo || !user;
  const taskAccess = realmRouteDecision(user, REALM_ERP_BRIDGE_CATALOG.find((item) => item.key === 'tasks'), modules, { demo: linkDemo });
  const projectAccess = realmRouteDecision(user, REALM_ERP_BRIDGE_CATALOG.find((item) => item.key === 'projects'), modules, { demo: linkDemo });
  const staffAccess = realmRouteDecision(user, REALM_ERP_BRIDGE_CATALOG.find((item) => item.key === 'staff'), modules, { demo: linkDemo });
  return {
    task: taskAccess.allowed ? realmRecordHref('task', task?.id) : null,
    project: projectAccess.allowed ? realmRecordHref('project', task?.project?.id) : null,
    owner: staffAccess.allowed ? realmRecordHref('staff', task?.assignee?.id) : null,
  };
}

export function createRealmErpBridge({ user, tasks = [], modules = null, demo = false, sourceOfTruth } = {}) {
  const uniqueProjects = new Set(tasks.map((task) => normalizeRealmRecordId(task?.project?.id)).filter(Boolean));
  const access = createRealmAccessManifest({ user, modules, demo });
  const portalRows = REALM_CORE_PORTALS.map((portal) => ({
    portal,
    decision: realmRouteDecision(user, portal, modules, { demo }),
  }));
  return {
    version: 2,
    sourceOfTruth: sourceOfTruth || (demo ? 'local' : 'erp'),
    actor: user?.id ? {
      id: user.id,
      name: user.name || 'ERP Adventurer',
      title: user.title || null,
    } : null,
    profileHref: demo || realmRouteDecision(user, REALM_ERP_BRIDGE_CATALOG.find((item) => item.key === 'staff'), modules).allowed
      ? realmRecordHref('staff', user?.id)
      : '/staff',
    portals: portalRows.filter((row) => row.decision.allowed).map((row) => row.portal),
    unavailablePortals: portalRows.filter((row) => !row.decision.allowed).map(({ portal, decision }) => ({
      ...portal,
      href: null,
      access: decision,
    })),
    access,
    counters: {
      quests: tasks.length,
      openQuests: tasks.filter((task) => task?.status !== 'done').length,
      campaigns: uniqueProjects.size,
    },
  };
}

export function unresolvedRealmBridgeMappings() {
  return REALM_ERP_BRIDGE_CATALOG.filter((item) => !item.mapped);
}
