export const COLLABORATION_PRESENCE_TTL_MS = 70_000;
export const COLLABORATION_CONTACT_TTL_MS = 5 * 60_000;
export const COLLABORATION_SURFACE_KEY = 'crmegoric-workspace-surface-v1';
export const COLLABORATION_AVAILABILITY_KEY = 'crmegoric-collaboration-availability-v1';
export const COLLABORATION_AVAILABILITY_EVENT = 'collaboration:availability';

const SESSION_ID = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{11,119}$/;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{11,119}$/;
const USER_ID = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,99}$/;
const SURFACES = new Set(['erp', 'realm']);
const AVAILABILITY = new Set(['available', 'busy', 'focus', 'dnd', 'away']);
const CAPABILITIES = new Set(['chat', 'voice', 'video']);
const CONTACT_KINDS = new Set(['knock', 'chat', 'voice']);
const CONTACT_STATUSES = new Set(['pending', 'accepted', 'declined', 'expired']);

export class CollaborationError extends Error {
  constructor(message, status = 400, code = 'collaboration_error') {
    super(message);
    this.name = 'CollaborationError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeCollaborationSessionId(value) {
  const sessionId = String(value || '').trim();
  if (!SESSION_ID.test(sessionId)) throw new CollaborationError('Session hiện diện không hợp lệ.', 400, 'invalid_presence_session');
  return sessionId;
}

export function normalizeCollaborationIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!IDEMPOTENCY_KEY.test(key)) throw new CollaborationError('Idempotency key không hợp lệ.', 400, 'invalid_idempotency_key');
  return key;
}

export function normalizeCollaborationUserId(value) {
  const userId = String(value || '').trim();
  if (!USER_ID.test(userId)) throw new CollaborationError('Người nhận không hợp lệ.', 400, 'invalid_contact_target');
  return userId;
}

export function normalizeCollaborationSurface(value, fallback = 'erp') {
  const surface = String(value || '').trim().toLowerCase();
  return SURFACES.has(surface) ? surface : fallback;
}

export function normalizeCollaborationAvailability(value, fallback = 'available') {
  const availability = String(value || '').trim().toLowerCase();
  return AVAILABILITY.has(availability) ? availability : fallback;
}

export function normalizeCollaborationCapabilities(value) {
  const values = Array.isArray(value) ? value : [];
  const capabilities = [...new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter((item) => CAPABILITIES.has(item)))];
  return capabilities.length ? capabilities : ['chat'];
}

export function normalizeCollaborationContactKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  return CONTACT_KINDS.has(kind) ? kind : 'chat';
}

export function normalizeCollaborationContactMessage(value, maxLength = 280) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function parseCollaborationCapabilities(value) {
  try {
    return normalizeCollaborationCapabilities(typeof value === 'string' ? JSON.parse(value) : value);
  } catch {
    return ['chat'];
  }
}

const AVAILABILITY_WEIGHT = { dnd: 5, busy: 4, focus: 3, available: 2, away: 1 };

export function mergeCollaborationDirectory({ users = [], sessions = [], selfUserId = '', now = new Date() } = {}) {
  const threshold = now.getTime() - COLLABORATION_PRESENCE_TTL_MS;
  const byUser = new Map();
  for (const session of sessions) {
    const seenAt = new Date(session.lastSeen).getTime();
    if (!Number.isFinite(seenAt) || seenAt < threshold) continue;
    const rows = byUser.get(session.userId) || [];
    rows.push({
      surface: normalizeCollaborationSurface(session.surface),
      availability: normalizeCollaborationAvailability(session.availability),
      capabilities: parseCollaborationCapabilities(session.capabilities),
      lastSeen: new Date(session.lastSeen).toISOString(),
    });
    byUser.set(session.userId, rows);
  }

  return users.filter((user) => user?.id && user.id !== selfUserId).map((user) => {
    const active = byUser.get(user.id) || [];
    const surfaces = [...new Set(active.map((session) => session.surface))].sort();
    const capabilities = [...new Set(active.flatMap((session) => session.capabilities))].sort();
    const availability = active.reduce(
      (best, session) => AVAILABILITY_WEIGHT[session.availability] > AVAILABILITY_WEIGHT[best] ? session.availability : best,
      active.length ? 'away' : 'away',
    );
    const lastSeen = active.map((session) => session.lastSeen).sort().at(-1) || null;
    return {
      id: user.id,
      userId: user.id,
      name: String(user.name || 'Nhân sự ERP').slice(0, 80),
      role: String(user.title || 'Guild Member').slice(0, 80),
      online: active.length > 0,
      availability,
      surfaces,
      capabilities,
      lastSeen,
    };
  });
}

export function collaborationContactRoute(conversationId, contactId = '') {
  const conversation = encodeURIComponent(String(conversationId || ''));
  const contact = encodeURIComponent(String(contactId || ''));
  return conversation
    ? `/messages?conversation=${conversation}${contact ? `&contact=${contact}` : ''}`
    : '/messages';
}

export function collaborationContactLabel(kind) {
  return normalizeCollaborationContactKind(kind) === 'voice' ? 'mời gọi thoại'
    : normalizeCollaborationContactKind(kind) === 'knock' ? 'đang gõ cửa'
      : 'muốn nhắn tin';
}

export function serializeCollaborationContact(row, viewerId = '') {
  const status = CONTACT_STATUSES.has(row?.status) ? row.status : 'expired';
  return {
    id: row.id,
    kind: normalizeCollaborationContactKind(row.kind),
    status,
    sourceSurface: normalizeCollaborationSurface(row.sourceSurface, 'realm'),
    message: normalizeCollaborationContactMessage(row.message),
    requester: {
      id: row.requesterId,
      name: String(row.requester?.name || row.requesterName || 'Đồng nghiệp').slice(0, 80),
    },
    target: {
      id: row.targetId,
      name: String(row.target?.name || row.targetName || 'Đồng nghiệp').slice(0, 80),
    },
    direction: viewerId === row.targetId ? 'incoming' : 'outgoing',
    conversationId: row.conversationId || null,
    route: collaborationContactRoute(row.conversationId, row.id),
    seenAt: row.seenAt ? new Date(row.seenAt).toISOString() : null,
    actionAt: row.actionAt ? new Date(row.actionAt).toISOString() : null,
    expiresAt: new Date(row.expiresAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export function rememberWorkspaceSurface(surface) {
  const normalized = normalizeCollaborationSurface(surface);
  if (typeof window !== 'undefined') window.localStorage.setItem(COLLABORATION_SURFACE_KEY, normalized);
  return normalized;
}

export function preferredWorkspaceSurface() {
  if (typeof window === 'undefined') return 'erp';
  return normalizeCollaborationSurface(window.localStorage.getItem(COLLABORATION_SURFACE_KEY));
}

export function rememberCollaborationAvailability(availability) {
  const normalized = normalizeCollaborationAvailability(availability);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COLLABORATION_AVAILABILITY_KEY, normalized);
    window.dispatchEvent(new CustomEvent(COLLABORATION_AVAILABILITY_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function preferredCollaborationAvailability() {
  if (typeof window === 'undefined') return 'available';
  return normalizeCollaborationAvailability(window.localStorage.getItem(COLLABORATION_AVAILABILITY_KEY));
}
