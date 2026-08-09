export const REALM_V2_AREAS = Object.freeze([
  { slug: 'home', label: 'Home', labelVi: 'Bảng điều khiển', group: 'Work', icon: 'home', template: 'focus', canonicalPath: '/dashboard' },
  { slug: 'my-work', label: 'My Work', labelVi: 'Việc của tôi', group: 'Work', icon: 'checklist', template: 'focus', canonicalPath: '/myday' },
  { slug: 'work-management', label: 'Work Management', labelVi: 'Quản lý công việc', group: 'Work', icon: 'board', template: 'board', canonicalPath: '/tasks' },
  { slug: 'action-center', label: 'Action Center', labelVi: 'Trung tâm hành động', group: 'Work', icon: 'bolt', template: 'queue', canonicalPath: '/approvals' },
  { slug: 'command-center', label: 'Command Center', labelVi: 'Trung tâm điều phối', group: 'Operations', icon: 'command', template: 'cockpit', canonicalPath: '/ceo-commands' },
  { slug: 'inbox', label: 'Unified Inbox', labelVi: 'Hộp thư hợp nhất', group: 'Operations', icon: 'inbox', template: 'registry', canonicalPath: '/messages' },
  { slug: 'projects', label: 'Project Realm', labelVi: 'Dự án', group: 'Operations', icon: 'folder', template: 'cockpit', canonicalPath: '/projects' },
  { slug: 'chronicle', label: 'Chronicle', labelVi: 'Sổ Realm', group: 'Operations', icon: 'timeline', template: 'timeline', canonicalPath: '/realm' },
  { slug: 'collaboration', label: 'Collaboration', labelVi: 'Điều phối công việc', group: 'Operations', icon: 'people', template: 'focus', canonicalPath: '/teamwork' },
  { slug: 'world-map', label: 'World Map', labelVi: 'Bản đồ bốn công ty', group: 'Intelligence', icon: 'map', template: 'map', canonicalPath: '/ceo-world' },
  { slug: 'ceo-terminal', label: 'CEO Terminal', labelVi: 'Tổng quan CEO', group: 'Intelligence', icon: 'brief', template: 'executive', canonicalPath: '/ceo-overview' },
  { slug: 'employee-profile', label: 'Employee Profile', labelVi: 'Hồ sơ nhân sự', group: 'People', icon: 'person', template: 'focus', canonicalPath: '/staff' },
  { slug: 'recognition', label: 'Recognition Ledger', labelVi: 'Sổ Realm và Gold', group: 'People', icon: 'ledger', template: 'registry', canonicalPath: '/realm' },
  { slug: 'approvals', label: 'Approvals', labelVi: 'Phê duyệt', group: 'Governance', icon: 'approval', template: 'queue', canonicalPath: '/approvals' },
  { slug: 'notifications', label: 'Notifications', labelVi: 'Thông báo', group: 'Governance', icon: 'bell', template: 'registry', canonicalPath: '/dashboard' },
  { slug: 'search', label: 'Search & Commands', labelVi: 'Tìm kiếm toàn hệ thống', group: 'Governance', icon: 'search', template: 'focus', canonicalPath: '/dashboard' },
  { slug: 'settings', label: 'Settings', labelVi: 'Cài đặt', group: 'Governance', icon: 'settings', template: 'settings', canonicalPath: '/settings' },
  { slug: 'mobile', label: 'Mobile Realm', labelVi: 'Không gian làm việc di động', group: 'Governance', icon: 'mobile', template: 'mobile', canonicalPath: '/dashboard' },
]);

export const COMMAND_STATES = Object.freeze([
  'draft', 'proposed', 'pending_approval', 'approved', 'executing', 'confirmed', 'failed',
]);

const TRANSITIONS = Object.freeze({
  draft: ['proposed'],
  proposed: ['draft', 'pending_approval'],
  pending_approval: ['approved', 'failed'],
  approved: ['executing'],
  executing: ['confirmed', 'failed'],
  confirmed: [],
  failed: ['draft', 'executing'],
});

export function areaBySlug(slug) {
  return REALM_V2_AREAS.find((area) => area.slug === slug) || REALM_V2_AREAS[0];
}

// Realm v2 is a presentation layer over the canonical product. These mappings
// deliberately land on the existing authenticated ERP/Realm routes so the
// original RBAC, workflows, records, APIs and receipts remain authoritative.
export function canonicalAreaHref(slug) {
  return areaBySlug(slug).canonicalPath;
}

export function canTransitionCommand(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function advanceCommand(command, to, evidence = {}) {
  const from = command?.state || 'draft';
  if (!canTransitionCommand(from, to)) {
    throw new Error(`Invalid command transition: ${from} -> ${to}`);
  }
  if (to === 'confirmed' && !evidence.receiptId) {
    throw new Error('Canonical receipt is required before confirmation');
  }
  if (to === 'pending_approval' && !evidence.authorizationChecked) {
    throw new Error('Authorization and business rules must be checked before approval');
  }
  return {
    ...command,
    state: to,
    receiptId: evidence.receiptId || command?.receiptId || null,
    auditHref: evidence.auditHref || command?.auditHref || null,
    updatedAt: evidence.updatedAt || new Date().toISOString(),
  };
}

export function resolveDisplayState({ loading, denied, redacted, offline, error, stale, empty } = {}) {
  if (loading) return 'loading';
  if (denied) return 'permission-denied';
  if (redacted) return 'redacted';
  if (offline) return 'offline';
  if (error) return 'error';
  if (stale) return 'stale';
  if (empty) return 'empty';
  return 'ready';
}

export function mobileDestinations() {
  return [
    { slug: 'home', label: 'Home', icon: 'home' },
    { slug: 'my-work', label: 'My Work', icon: 'checklist' },
    { slug: 'action-center', label: 'Actions', icon: 'bolt' },
    { slug: 'inbox', label: 'Inbox', icon: 'inbox' },
    { slug: 'mobile', label: 'More', icon: 'more' },
  ];
}

export function realmV2PreviewEnabled(env = process.env) {
  return env.NODE_ENV !== 'production' || env.REALM_V2_PREVIEW === 'true';
}
