const KIND_BY_PATH = Object.freeze([
  { prefix: '/tasks', kind: 'quest', kindLabel: 'War Council', targetLabel: 'Task ERP', icon: 'tasks' },
  { prefix: '/leads', kind: 'diplomacy', kindLabel: 'Royal Embassy', targetLabel: 'Lead CRM', icon: 'leads' },
  { prefix: '/approvals', kind: 'approval', kindLabel: 'Royal Decree', targetLabel: 'phê duyệt', icon: 'shield' },
  { prefix: '/tickets', kind: 'support', kindLabel: 'Guild Support', targetLabel: 'ticket', icon: 'alert' },
  { prefix: '/messages', kind: 'message', kindLabel: 'Lantern Mail', targetLabel: 'hội thoại', icon: 'mail' },
  { prefix: '/realm', kind: 'realm', kindLabel: 'Realm', targetLabel: 'Realm', icon: 'shield' },
]);

export const NOTIFICATION_SYNC_EVENT = 'crmegoric:notifications-changed';

const safeText = (value, max = 320) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

function isoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeNotificationRoute(value, fallback = '/messages') {
  const route = String(value ?? '').trim();
  if (!route || !route.startsWith('/') || route.startsWith('//') || route.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(route) || /%(?:0[0-9a-f]|7f)/i.test(route) || route.length > 500) return fallback;
  try {
    const parsed = new URL(route, 'https://crm.internal');
    if (parsed.origin !== 'https://crm.internal' || !/^\/[a-z0-9/_-]*$/i.test(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function notificationRecordRoute(resource, id) {
  const root = ({ tasks: '/tasks', leads: '/leads', approvals: '/approvals', tickets: '/tickets' })[String(resource || '').toLowerCase()];
  const recordId = String(id ?? '').trim();
  if (!root || !/^[a-zA-Z0-9:_-]{1,100}$/.test(recordId)) return root || '/messages';
  return `${root}?focus=${encodeURIComponent(recordId)}&from=notification`;
}

export function notificationRouteMeta(value) {
  const route = normalizeNotificationRoute(value);
  const pathname = route.split(/[?#]/, 1)[0];
  const match = KIND_BY_PATH.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  return match ? {
    kind: match.kind, kindLabel: match.kindLabel, targetLabel: match.targetLabel, icon: match.icon,
  } : { kind: 'system', kindLabel: 'Realm Dispatch', targetLabel: 'ERP · CRM', icon: 'bell' };
}

export function normalizeNotificationDraft(text, route) {
  return {
    text: safeText(text, 320) || 'Bạn có một cập nhật mới trong ERP · CRM.',
    route: normalizeNotificationRoute(route || '/messages'),
  };
}

export function normalizeNotificationRow(row = {}) {
  const draft = normalizeNotificationDraft(row.text, row.route);
  const meta = notificationRouteMeta(draft.route);
  return {
    id: safeText(row.id, 100),
    ...draft,
    ...meta,
    readAt: isoDate(row.readAt),
    createdAt: isoDate(row.createdAt) || new Date(0).toISOString(),
  };
}
