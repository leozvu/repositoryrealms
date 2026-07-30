export const REALM_V2_AREAS = Object.freeze([
  { slug: 'home', label: 'Home', group: 'Work', icon: 'home', template: 'focus' },
  { slug: 'my-work', label: 'My Work', group: 'Work', icon: 'checklist', template: 'focus' },
  { slug: 'work-management', label: 'Work Management', group: 'Work', icon: 'board', template: 'board' },
  { slug: 'action-center', label: 'Action Center', group: 'Work', icon: 'bolt', template: 'queue' },
  { slug: 'command-center', label: 'Command Center', group: 'Operations', icon: 'command', template: 'cockpit' },
  { slug: 'inbox', label: 'Unified Inbox', group: 'Operations', icon: 'inbox', template: 'registry' },
  { slug: 'projects', label: 'Project Realm', group: 'Operations', icon: 'folder', template: 'cockpit' },
  { slug: 'chronicle', label: 'Chronicle', group: 'Operations', icon: 'timeline', template: 'timeline' },
  { slug: 'collaboration', label: 'Collaboration', group: 'Operations', icon: 'people', template: 'focus' },
  { slug: 'world-map', label: 'World Map', group: 'Intelligence', icon: 'map', template: 'map' },
  { slug: 'ceo-terminal', label: 'CEO Terminal', group: 'Intelligence', icon: 'brief', template: 'executive' },
  { slug: 'employee-profile', label: 'Employee Profile', group: 'People', icon: 'person', template: 'focus' },
  { slug: 'recognition', label: 'Recognition Ledger', group: 'People', icon: 'ledger', template: 'registry' },
  { slug: 'approvals', label: 'Approvals', group: 'Governance', icon: 'approval', template: 'queue' },
  { slug: 'notifications', label: 'Notifications', group: 'Governance', icon: 'bell', template: 'registry' },
  { slug: 'search', label: 'Search & Commands', group: 'Governance', icon: 'search', template: 'focus' },
  { slug: 'settings', label: 'Settings', group: 'Governance', icon: 'settings', template: 'settings' },
  { slug: 'mobile', label: 'Mobile Realm', group: 'Governance', icon: 'mobile', template: 'mobile' },
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
