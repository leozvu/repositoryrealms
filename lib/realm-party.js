import { normalizeProfile } from './realm-protocol.js';

export const REALM_GATEWAY_ID = 'realm-gateway';
export const DEFAULT_MAX_PARTY_SIZE = 6;

export const PARTY_CLIENT_MESSAGE_TYPES = Object.freeze([
  'party-invite',
  'party-response',
  'party-cancel-invite',
  'party-leave',
  'party-end',
  'party-kick',
]);

export const PARTY_SERVER_MESSAGE_TYPES = Object.freeze([
  'party-state',
  'party-event',
]);

export const PARTY_MESSAGE_TYPES = Object.freeze([
  ...PARTY_CLIENT_MESSAGE_TYPES,
  ...PARTY_SERVER_MESSAGE_TYPES,
]);

export const PARTY_EVENT_KINDS = Object.freeze([
  'invite-sent',
  'invite-declined',
  'invite-cancelled',
  'member-joined',
  'member-left',
  'member-kicked',
  'host-transferred',
  'party-ended',
  'party-error',
]);

const PARTY_ID = /^[a-z0-9-]{8,96}$/i;
const CLIENT_ID = /^[a-z0-9-]{3,96}$/i;
const LIVEKIT_ROOM_NAME = /^[a-z0-9-]{8,64}$/i;

export function normalizePartyId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return PARTY_ID.test(id) ? id : '';
}

export function normalizePartyClientId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return CLIENT_ID.test(id) ? id : '';
}

function normalizePartyLimit(value) {
  const limit = Math.round(Number(value) || DEFAULT_MAX_PARTY_SIZE);
  return Math.max(2, Math.min(limit, 12));
}

export function normalizePartyMedia(value = {}) {
  if (value?.provider !== 'livekit') return null;
  const roomName = typeof value.roomName === 'string' ? value.roomName.trim() : '';
  const token = typeof value.token === 'string' ? value.token.trim() : '';
  const expiresAt = Number(value.expiresAt);
  let url = '';
  try {
    const parsed = new URL(typeof value.url === 'string' ? value.url.trim() : '');
    if (['ws:', 'wss:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
      url = parsed.href.replace(/\/$/, '');
    }
  } catch {}
  if (!url || !LIVEKIT_ROOM_NAME.test(roomName) || token.length < 32 || token.length > 8192 || !Number.isFinite(expiresAt)) return null;
  return { provider: 'livekit', url, roomName, token, expiresAt };
}

export function normalizePartyInvite(value = {}, senderId = '') {
  const partyId = normalizePartyId(value.partyId);
  const hostId = normalizePartyClientId(value.hostId) || normalizePartyClientId(senderId);
  if (!partyId || !hostId) return null;
  return {
    partyId,
    hostId,
    hostProfile: normalizeProfile(value.hostProfile),
    memberCount: Math.max(1, Math.round(Number(value.memberCount) || 1)),
    maxMembers: normalizePartyLimit(value.maxMembers),
    authoritative: value.authoritative === true || senderId === REALM_GATEWAY_ID,
  };
}

export function normalizePartyResponse(value = {}, senderId = '') {
  const partyId = normalizePartyId(value.partyId);
  const memberId = normalizePartyClientId(senderId);
  if (!partyId || !memberId || typeof value.accepted !== 'boolean') return null;
  return {
    partyId,
    memberId,
    accepted: value.accepted,
    memberProfile: normalizeProfile(value.memberProfile),
  };
}

export function normalizePartyState(value = {}) {
  const raw = Object.prototype.hasOwnProperty.call(value, 'party') ? value.party : value;
  if (raw == null) return null;
  const id = normalizePartyId(raw.id);
  const hostId = normalizePartyClientId(raw.hostId);
  if (!id || !hostId || !Array.isArray(raw.members)) return null;

  const seen = new Set();
  const members = raw.members.flatMap((member) => {
    const memberId = normalizePartyClientId(member?.id);
    if (!memberId || seen.has(memberId)) return [];
    seen.add(memberId);
    return [{
      id: memberId,
      profile: normalizeProfile(member.profile),
      joinedAt: Number.isFinite(member.joinedAt) ? member.joinedAt : Date.now(),
    }];
  }).slice(0, 12);
  if (!members.length || !seen.has(hostId)) return null;

  const pendingInvites = Array.isArray(raw.pendingInvites)
    ? raw.pendingInvites.flatMap((invite) => {
      const targetId = normalizePartyClientId(invite?.targetId);
      if (!targetId || seen.has(targetId)) return [];
      return [{
        targetId,
        targetProfile: normalizeProfile(invite.targetProfile),
        invitedAt: Number.isFinite(invite.invitedAt) ? invite.invitedAt : Date.now(),
      }];
    }).slice(0, 12)
    : [];

  return {
    id,
    hostId,
    members,
    pendingInvites,
    maxMembers: normalizePartyLimit(raw.maxMembers),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    authoritative: raw.authoritative === true,
    media: normalizePartyMedia(raw.media),
  };
}

export function normalizePartyEvent(value = {}) {
  if (!PARTY_EVENT_KINDS.includes(value.kind)) return null;
  const partyId = value.partyId == null ? '' : normalizePartyId(value.partyId);
  if (value.partyId != null && !partyId) return null;
  return {
    kind: value.kind,
    partyId,
    actorId: normalizePartyClientId(value.actorId),
    actorProfile: normalizeProfile(value.actorProfile),
    targetId: normalizePartyClientId(value.targetId),
    targetProfile: normalizeProfile(value.targetProfile),
    code: typeof value.code === 'string' ? value.code.trim().slice(0, 48) : '',
    message: typeof value.message === 'string' ? value.message.trim().slice(0, 180) : '',
  };
}

export function createPartyId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `party-${crypto.randomUUID()}`;
  return `party-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
