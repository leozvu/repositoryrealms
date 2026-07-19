export const REALM_PROTOCOL_VERSION = 2;
export const REALM_CHANNEL = 'crmegoric-realms-demo-v2';
export const VOICE_RADIUS = 5;
export const REALM_MESSAGE_TYPES = Object.freeze([
  'presence',
  'leave',
  'chat',
  'whisper',
  'emote',
  'party-invite',
  'party-response',
  'party-cancel-invite',
  'party-leave',
  'party-end',
  'party-kick',
  'party-state',
  'party-event',
  'signal',
]);

export const EMPTY_LOADOUT = Object.freeze({ title: null, seal: null, banner: null });

export const DEFAULT_PROFILE = Object.freeze({
  name: 'Adventurer Zero',
  role: 'Realm Builder',
  color: '#3b8061',
  loadout: EMPTY_LOADOUT,
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LOADOUT_SLOTS = Object.freeze(['title', 'seal', 'banner']);
const LOADOUT_ICONS = new Set(['shield', 'edit', 'tag']);

function normalizeLoadoutItem(value, slot) {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim().slice(0, 60) : '';
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 60) : '';
  const equipName = typeof value.equipName === 'string' ? value.equipName.trim().slice(0, 60) : '';
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(id) || !name || !equipName || value.slot !== slot) return null;
  return {
    id,
    name,
    equipName,
    slot,
    slotLabel: typeof value.slotLabel === 'string' ? value.slotLabel.trim().slice(0, 30) : slot,
    icon: LOADOUT_ICONS.has(value.icon) ? value.icon : 'shield',
  };
}

export function normalizeLoadout(value = {}) {
  return Object.fromEntries(LOADOUT_SLOTS.map((slot) => [slot, normalizeLoadoutItem(value?.[slot], slot)]));
}

export function normalizeProfile(value = {}) {
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 40) : '';
  const role = typeof value.role === 'string' ? value.role.trim().slice(0, 40) : '';
  const color = typeof value.color === 'string' && HEX_COLOR.test(value.color)
    ? value.color.toLowerCase()
    : DEFAULT_PROFILE.color;

  return {
    name: name || DEFAULT_PROFILE.name,
    role: role || DEFAULT_PROFILE.role,
    color,
    loadout: normalizeLoadout(value.loadout),
  };
}

export function realmPresenceIdentity(value = {}) {
  const stableId = typeof value.userId === 'string' && value.userId.trim()
    ? value.userId.trim().slice(0, 100)
    : typeof value.identityId === 'string' && value.identityId.trim()
      ? value.identityId.trim().slice(0, 100)
      : '';
  if (stableId) return `user:${stableId}`;
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 40) : '';
  return name ? `name:${name.normalize('NFKC').toLocaleLowerCase('vi-VN')}` : '';
}

export function mergeRealmPresencePeople({ staff = [], remotePlayers = [], selfProfile = null } = {}) {
  const selfIdentity = realmPresenceIdentity(selfProfile || {});
  const people = [];
  const selfName = typeof selfProfile?.name === 'string' && selfProfile.name.trim()
    ? `name:${selfProfile.name.trim().normalize('NFKC').toLocaleLowerCase('vi-VN')}`
    : '';
  const seen = new Set([selfIdentity, selfName].filter(Boolean));
  const remoteFirst = [...(Array.isArray(remotePlayers) ? remotePlayers : [])]
    .sort((a, b) => Number(b?.seenAt || 0) - Number(a?.seenAt || 0));
  for (const person of [...remoteFirst, ...(Array.isArray(staff) ? staff : [])]) {
    const identity = realmPresenceIdentity(person);
    const nameIdentity = typeof person?.name === 'string' && person.name.trim()
      ? `name:${person.name.trim().normalize('NFKC').toLocaleLowerCase('vi-VN')}`
      : '';
    const identities = [identity, nameIdentity].filter(Boolean);
    if (!identities.length || identities.some((candidate) => seen.has(candidate))) continue;
    for (const candidate of identities) seen.add(candidate);
    people.push(person);
  }
  return people;
}

export function isRealmMessage(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.version !== REALM_PROTOCOL_VERSION) return false;
  if (typeof value.type !== 'string' || typeof value.senderId !== 'string') return false;
  if (value.targetId != null && typeof value.targetId !== 'string') return false;
  return REALM_MESSAGE_TYPES.includes(value.type);
}

export function isInVoiceRange(local, remote, radius = VOICE_RADIUS) {
  if (!local || !remote) return false;
  if (remote.status === 'dnd') return false;
  if (local.zoneId && local.zoneId === remote.zoneId) return true;
  if (![local.x, local.y, remote.x, remote.y].every(Number.isFinite)) return false;
  return Math.hypot(local.x - remote.x, local.y - remote.y) <= radius;
}

export function createEnvelope(type, senderId, payload = {}, targetId) {
  return {
    version: REALM_PROTOCOL_VERSION,
    type,
    senderId,
    ...(targetId ? { targetId } : {}),
    payload,
    sentAt: Date.now(),
  };
}
