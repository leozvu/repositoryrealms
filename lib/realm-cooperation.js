import { normalizeProfile } from './realm-protocol.js';

export const REALM_COOPERATION_VERSION = 1;

export const COOPERATION_MESSAGE_TYPES = Object.freeze([
  'coop-sync-request',
  'coop-action',
  'coop-state',
  'coop-event',
]);

export const WORK_SESSION_PHASES = Object.freeze(['forming', 'focus', 'review']);
export const WORK_NOTE_KINDS = Object.freeze(['note', 'blocker', 'decision']);
export const WORK_ACTION_TYPES = Object.freeze([
  'set-ready',
  'set-phase',
  'toggle-agenda',
  'add-note',
  'set-anchor',
  'finish',
]);

const SESSION_ID = /^work-[a-z0-9-]{8,96}$/i;
const PARTY_ID = /^[a-z0-9-]{8,96}$/i;
const CLIENT_ID = /^[a-z0-9-]{3,96}$/i;
const ITEM_ID = /^[a-z0-9][a-z0-9-]{1,63}$/i;
const WORK_KINDS = new Set(['task', 'project', 'object']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function safeText(value, max = 160) {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function safeClientId(value) {
  const id = safeText(value, 96);
  return CLIENT_ID.test(id) ? id : '';
}

function safePartyId(value) {
  const id = safeText(value, 96);
  return PARTY_ID.test(id) ? id : '';
}

function safeItemId(value, fallback = '') {
  const id = safeText(value, 64).toLocaleLowerCase('en-US').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return ITEM_ID.test(id) ? id : fallback;
}

export class RealmCooperationError extends Error {
  constructor(message, code = 'work_session_invalid') {
    super(message);
    this.name = 'RealmCooperationError';
    this.code = code;
  }
}

export function createRealmWorkSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `work-${crypto.randomUUID()}`;
  return `work-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeRealmWorkReference(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = WORK_KINDS.has(value.kind) ? value.kind : 'object';
  const id = safeText(value.id, 100);
  const title = safeText(value.title, 120);
  if (!id || !title) return null;
  return {
    kind,
    id,
    title,
    context: safeText(value.context, 120),
    status: safeText(value.status, 32),
  };
}

export function normalizeRealmWorkAnchor(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    objectId: safeText(value.objectId, 64),
    x: clamp(x, 0, 48),
    y: clamp(y, 0, 44),
  };
}

function normalizeAgenda(value = [], fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  const seen = new Set();
  return source.flatMap((item, index) => {
    const label = safeText(typeof item === 'string' ? item : item?.label, 100);
    const id = safeItemId(typeof item === 'string' ? `step-${index + 1}` : item?.id, `step-${index + 1}`);
    if (!label || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      label,
      done: typeof item === 'object' && item?.done === true,
      completedBy: safeClientId(typeof item === 'object' ? item?.completedBy : ''),
    }];
  }).slice(0, 6);
}

function normalizeMembers(value = [], hostId = '') {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap((member) => {
    const id = safeClientId(member?.id);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      profile: normalizeProfile(member.profile),
      ready: member.ready === true,
      role: id === hostId ? 'facilitator' : 'contributor',
      joinedAt: Number.isFinite(Number(member.joinedAt)) ? Number(member.joinedAt) : Date.now(),
    }];
  }).slice(0, 12);
}

function normalizeNotes(value = []) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap((note, index) => {
    const text = safeText(note?.text, 240);
    const authorId = safeClientId(note?.authorId);
    const id = safeItemId(note?.id, `entry-${index + 1}`);
    if (!text || !authorId || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      kind: WORK_NOTE_KINDS.includes(note.kind) ? note.kind : 'note',
      text,
      authorId,
      authorName: safeText(note.authorName, 40) || normalizeProfile().name,
      at: Number.isFinite(Number(note.at)) ? Number(note.at) : Date.now(),
    }];
  }).slice(-18);
}

export function normalizeRealmWorkSession(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = Object.prototype.hasOwnProperty.call(value, 'session') ? value.session : value;
  if (!raw || typeof raw !== 'object') return null;
  const id = safeText(raw.id, 101);
  const partyId = safePartyId(raw.partyId);
  const hostId = safeClientId(raw.hostId);
  const work = normalizeRealmWorkReference(raw.work);
  const anchor = normalizeRealmWorkAnchor(raw.anchor);
  const phase = WORK_SESSION_PHASES.includes(raw.phase) ? raw.phase : 'forming';
  if (!SESSION_ID.test(id) || !partyId || !hostId || !work || !anchor) return null;
  const members = normalizeMembers(raw.members, hostId);
  if (!members.some((member) => member.id === hostId)) return null;
  const version = Math.max(1, Math.round(Number(raw.version) || 1));
  return {
    id,
    partyId,
    hostId,
    work,
    anchor,
    phase,
    members,
    agenda: normalizeAgenda(raw.agenda),
    notes: normalizeNotes(raw.notes),
    focusStartedAt: Number.isFinite(Number(raw.focusStartedAt)) ? Number(raw.focusStartedAt) : null,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
    version,
  };
}

export function createRealmWorkSession({ party, hostId, work, anchor, agenda = [] }, now = Date.now()) {
  const partyId = safePartyId(party?.id);
  const safeHostId = safeClientId(hostId);
  const normalizedWork = normalizeRealmWorkReference(work);
  const normalizedAnchor = normalizeRealmWorkAnchor(anchor);
  if (!partyId || !safeHostId || party?.hostId !== safeHostId || !normalizedWork || !normalizedAnchor) {
    throw new RealmCooperationError('Chỉ host của Party hợp lệ mới có thể mở phiên phối hợp.', 'work_session_host_required');
  }
  const members = normalizeMembers(party.members, safeHostId);
  if (members.length < 2) throw new RealmCooperationError('Phiên phối hợp cần ít nhất hai thành viên.', 'work_session_members_required');
  const session = {
    id: createRealmWorkSessionId(),
    partyId,
    hostId: safeHostId,
    work: normalizedWork,
    anchor: normalizedAnchor,
    phase: 'forming',
    members,
    agenda: normalizeAgenda(agenda, [
      'Chốt kết quả cần bàn giao',
      'Xử lý phần việc chính',
      'Review và ghi quyết định',
    ]),
    notes: [],
    focusStartedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  return normalizeRealmWorkSession(session);
}

export function normalizeRealmWorkAction(value = {}) {
  const type = WORK_ACTION_TYPES.includes(value.type) ? value.type : '';
  const sessionId = safeText(value.sessionId, 101);
  if (!type || !SESSION_ID.test(sessionId)) return null;
  const payload = value.payload && typeof value.payload === 'object' ? value.payload : {};
  if (type === 'set-ready' && typeof payload.ready !== 'boolean') return null;
  if (type === 'set-phase' && !WORK_SESSION_PHASES.includes(payload.phase)) return null;
  if (type === 'toggle-agenda' && !safeItemId(payload.itemId)) return null;
  if (type === 'add-note' && (!WORK_NOTE_KINDS.includes(payload.kind) || !safeText(payload.text, 240))) return null;
  if (type === 'set-anchor' && !normalizeRealmWorkAnchor(payload.anchor)) return null;
  return { type, sessionId, payload };
}

export function syncRealmWorkSessionMembers(session, party, now = Date.now()) {
  const current = normalizeRealmWorkSession(session);
  if (!current || party?.id !== current.partyId || party?.hostId !== current.hostId) return null;
  const readiness = new Map(current.members.map((member) => [member.id, member.ready]));
  const members = normalizeMembers(party.members, current.hostId).map((member) => ({
    ...member,
    ready: readiness.get(member.id) === true,
  }));
  if (members.length < 2) return null;
  const same = members.length === current.members.length
    && members.every((member, index) => member.id === current.members[index]?.id && member.ready === current.members[index]?.ready);
  return same ? current : { ...current, members, updatedAt: now, version: current.version + 1 };
}

export function applyRealmWorkSessionAction(session, actor, action, party, now = Date.now()) {
  let current = syncRealmWorkSessionMembers(session, party, now);
  const normalizedAction = normalizeRealmWorkAction(action);
  const actorId = safeClientId(actor?.id);
  if (!current || !normalizedAction || normalizedAction.sessionId !== current.id) {
    throw new RealmCooperationError('Phiên phối hợp hoặc hành động không hợp lệ.', 'work_session_action_invalid');
  }
  if (!current.members.some((member) => member.id === actorId)) {
    throw new RealmCooperationError('Người gửi không thuộc phiên phối hợp này.', 'work_session_member_required');
  }
  const hostOnly = ['set-phase', 'set-anchor', 'finish'];
  if (hostOnly.includes(normalizedAction.type) && actorId !== current.hostId) {
    throw new RealmCooperationError('Chỉ facilitator mới có thể thay đổi nhịp phiên.', 'work_session_facilitator_required');
  }

  const { type, payload } = normalizedAction;
  if (type === 'set-ready') {
    current = { ...current, members: current.members.map((member) => member.id === actorId ? { ...member, ready: payload.ready } : member) };
  } else if (type === 'set-phase') {
    current = {
      ...current,
      phase: payload.phase,
      focusStartedAt: payload.phase === 'focus' ? (current.focusStartedAt || now) : current.focusStartedAt,
    };
  } else if (type === 'toggle-agenda') {
    const itemId = safeItemId(payload.itemId);
    current = {
      ...current,
      agenda: current.agenda.map((item) => item.id === itemId
        ? { ...item, done: !item.done, completedBy: item.done ? '' : actorId }
        : item),
    };
  } else if (type === 'add-note') {
    current = {
      ...current,
      notes: [...current.notes, {
        id: safeItemId(payload.id, `entry-${current.version + 1}`),
        kind: payload.kind,
        text: safeText(payload.text, 240),
        authorId: actorId,
        authorName: normalizeProfile(actor.profile).name,
        at: now,
      }].slice(-18),
    };
  } else if (type === 'set-anchor') {
    current = { ...current, anchor: normalizeRealmWorkAnchor(payload.anchor) };
  } else if (type === 'finish') {
    return { ...current, phase: 'review', updatedAt: now, version: current.version + 1, finished: true };
  }
  return normalizeRealmWorkSession({ ...current, updatedAt: now, version: current.version + 1 });
}

export function realmWorkSessionProgress(session) {
  const normalized = normalizeRealmWorkSession(session);
  if (!normalized) return { ready: 0, members: 0, done: 0, agenda: 0 };
  return {
    ready: normalized.members.filter((member) => member.ready).length,
    members: normalized.members.length,
    done: normalized.agenda.filter((item) => item.done).length,
    agenda: normalized.agenda.length,
  };
}

function cooperationDigest(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function realmWorkSessionTaskComment(session, note) {
  const normalized = normalizeRealmWorkSession(session);
  const noteId = safeItemId(note?.id);
  const entry = normalized?.notes.find((item) => item.id === noteId);
  if (!normalized || normalized.work.kind !== 'task' || !entry) {
    throw new RealmCooperationError('Shared log không thể ghi vào Task này.', 'work_session_comment_invalid');
  }
  const kind = entry.kind === 'blocker' ? 'Blocker' : entry.kind === 'decision' ? 'Quyết định' : 'Ghi chú';
  return {
    idempotencyKey: `work-session:${cooperationDigest(`${normalized.id}:${entry.id}`)}:${entry.id}`.slice(0, 120),
    body: {
      action: 'task.comment.create',
      entityId: normalized.work.id,
      content: `[Guild Work Session · ${kind}] ${entry.text}`,
    },
  };
}
