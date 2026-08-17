import { ERP_NAV } from './erp-navigation.js';

const GROUPS = [
  {
    key: 'home',
    label: 'Trang chủ',
    shortLabel: 'Trang chủ',
    icon: 'home',
    keys: ['dashboard'],
  },
  {
    key: 'work',
    label: 'Công việc',
    shortLabel: 'Công việc',
    icon: 'work',
    keys: ['myday', 'teamwork', 'projects', 'tasks', 'calendar', 'timesheet', 'gantt', 'resources', 'templates'],
  },
  {
    key: 'sales',
    label: 'Bán hàng',
    shortLabel: 'Bán hàng',
    icon: 'leads',
    keys: ['leads', 'clients', 'quotes', 'contracts', 'services', 'tickets'],
  },
  {
    key: 'finance',
    label: 'Tài chính',
    shortLabel: 'Tài chính',
    icon: 'finance',
    keys: ['finance', 'invoices', 'vendors', 'financials', 'finplan', 'fxreval', 'commissions'],
  },
  {
    key: 'people',
    label: 'Nhân sự',
    shortLabel: 'Nhân sự',
    icon: 'people',
    keys: ['staff', 'attendance', 'payroll', 'recruitment', 'reviews', 'freelancers'],
  },
  {
    key: 'operations',
    label: 'Vận hành',
    shortLabel: 'Thao tác',
    icon: 'approval',
    keys: ['approvals', 'assets', 'automation', 'inventory', 'growing', 'shipments', 'markets', 'import'],
  },
  {
    key: 'livestream',
    label: 'Phòng Livestream Egolive',
    shortLabel: 'Livestream',
    icon: 'calendar',
    keys: ['live', 'violations'],
  },
  {
    key: 'realm',
    label: 'Realm',
    shortLabel: 'Hộp thư',
    icon: 'map',
    keys: ['realm', 'realm-ledger', 'messages'],
  },
  {
    key: 'more',
    label: 'Quản trị và hệ thống',
    shortLabel: 'Thêm',
    icon: 'more',
    keys: [
      'analytics', 'okr', 'portfolio', 'reports', 'audit', 'settings', 'guide', 'docs', 'install',
      'ceo-overview', 'ceo-navigator', 'ceo-briefing', 'ceo-decisions', 'ceo-world',
      'ceo-commands', 'ceo-workforce', 'ceo-inbox', 'ceo-registry', 'ceo-security', 'ceo-rollout',
    ],
  },
];

const byKey = new Map(ERP_NAV.filter((item) => item.key).map((item) => [item.key, item]));

export function workspaceNavigation(visible, { freelancer = false, ceoPortal = false } = {}) {
  if (freelancer) {
    return [{
      key: 'work', label: 'Công việc', shortLabel: 'Công việc', icon: 'work',
      items: [{ key: 'freelancer', label: 'Công việc của tôi', icon: 'tasks', href: '/freelancer' }],
    }];
  }

  return GROUPS.map((group) => ({
    ...group,
    items: group.keys
      .map((key) => byKey.get(key))
      .filter(Boolean)
      .filter((item) => visible(item))
      .map((item) => ({ ...item, href: item.href || `/${item.key}` })),
  }))
    .filter((group) => group.items.length)
    .filter((group) => !ceoPortal || group.key === 'more');
}

export function currentWorkspaceLocation(groups, pathname) {
  for (const group of groups) {
    const item = group.items.find((candidate) => {
      const path = candidate.href.split('?')[0];
      return pathname === path || pathname.startsWith(`${path}/`);
    });
    if (item) return { group, item };
  }
  return { group: null, item: null };
}

export const MOBILE_NAV_KEYS = ['home', 'work', 'operations', 'realm', 'more'];
