import { COLLABORATION_PRESENCE_TTL_MS, normalizeCollaborationAvailability, normalizeCollaborationSurface } from './collaboration.js';

export const CEO_FEDERATION_VERSION = 1;
export const CEO_FEDERATION_CONTRACT = 'repositoryrealms.ceo.realm-federation';
export const CEO_FEDERATION_PRESENCE_CONTRACT = 'repositoryrealms.ceo.realm-presence';
export const CEO_FEDERATION_SCOPE = 'realm.federation.read';
export const CEO_FEDERATION_FETCH_TIMEOUT_MS = 2_500;
export const CEO_FEDERATION_MAX_RESPONSE_BYTES = 64 * 1024;
export const CEO_FEDERATION_CLOCK_SKEW_MS = 30_000;

const FEDERATION_SURFACES = new Set(['erp', 'realm']);
const FEDERATION_AVAILABILITY = new Set(['available', 'busy', 'focus', 'dnd', 'away']);
const FEDERATION_USER_ID = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,99}$/;

export const CEO_FEDERATION_KINGDOMS = Object.freeze({
  aim: Object.freeze({ order: 1, realmName: 'The Verdant Guild', mapPosition: 'northwest', landmark: 'guild-citadel', gatewayPath: '/realm' }),
  egoric: Object.freeze({ order: 2, realmName: 'The Emerald Crown', mapPosition: 'northeast', landmark: 'royal-fortress', gatewayPath: '/realm' }),
  vnecom: Object.freeze({ order: 3, realmName: 'The Mercantile Haven', mapPosition: 'southwest', landmark: 'harbor-kingdom', gatewayPath: '/realm' }),
  egolive: Object.freeze({ order: 4, realmName: 'The Ember Arena', mapPosition: 'southeast', landmark: 'broadcast-arena', gatewayPath: '/realm' }),
});

export class CeoFederationError extends Error {
  constructor(message, status = 400, code = 'ceo_federation_invalid') {
    super(message);
    this.name = 'CeoFederationError';
    this.status = status;
    this.code = code;
  }
}

const iso = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new CeoFederationError('Federation timestamp is invalid.', 400, 'ceo_federation_timestamp_invalid');
  return date.toISOString();
};

const bounded = (value, max = 80, fallback = '') => String(value || fallback).trim().replace(/\s+/g, ' ').slice(0, max);

export function normalizeCeoFederationPolicy(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const version = Number(input.version);
  return {
    version: Number.isInteger(version) && version > 0 ? version : 1,
    presenceEnabled: input.presenceEnabled === true,
    updatedAt: input.updatedAt ? iso(input.updatedAt) : null,
  };
}

export function normalizeCeoFederationPolicyUpdate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['expectedVersion', 'presenceEnabled'].includes(key))) {
    throw new CeoFederationError('Federation policy update is invalid.', 400, 'ceo_federation_policy_invalid');
  }
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || typeof input.presenceEnabled !== 'boolean') {
    throw new CeoFederationError('Federation policy version or value is invalid.', 400, 'ceo_federation_policy_invalid');
  }
  return { expectedVersion, presenceEnabled: input.presenceEnabled };
}

function activePresenceByUser(sessions, now) {
  const threshold = now.getTime() - COLLABORATION_PRESENCE_TTL_MS;
  const result = new Map();
  for (const session of sessions || []) {
    const seenAt = new Date(session.lastSeen).getTime();
    if (!session.userId || !Number.isFinite(seenAt) || seenAt < threshold) continue;
    const normalized = {
      surface: normalizeCollaborationSurface(session.surface),
      availability: normalizeCollaborationAvailability(session.availability),
      seenAt,
    };
    const current = result.get(session.userId);
    if (!current || normalized.seenAt > current.seenAt) result.set(session.userId, normalized);
  }
  return result;
}

export function buildCeoFederationPresenceEnvelope({ entity, policy, profiles = [], sessions = [], asOf = new Date() } = {}) {
  if (!entity?.id) throw new CeoFederationError('Federation entity is unavailable.', 503, 'ceo_federation_entity_unavailable');
  const normalizedPolicy = normalizeCeoFederationPolicy(policy);
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  const eligible = normalizedPolicy.presenceEnabled
    ? profiles.filter((profile) => profile?.sharedWithCeoPortal === true && profile?.sharePresence === true && profile?.user?.status === 'active' && profile?.user?.userType === 'employee')
    : [];
  const active = activePresenceByUser(sessions, now);
  const people = eligible.filter((profile) => active.has(profile.userId)).map((profile) => {
    const presence = active.get(profile.userId);
    return {
      userId: profile.userId,
      displayName: bounded(profile.displayName || profile.user.name, 80, 'Realm member'),
      title: bounded(profile.title || profile.user.title, 80) || null,
      availability: presence.availability,
      surface: presence.surface,
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName)).slice(0, 200);
  return {
    contract: CEO_FEDERATION_PRESENCE_CONTRACT,
    version: CEO_FEDERATION_VERSION,
    targetEntityId: entity.id,
    asOf: iso(now),
    ttlMs: COLLABORATION_PRESENCE_TTL_MS,
    policy: { presenceEnabled: normalizedPolicy.presenceEnabled, mode: 'explicit-opt-in' },
    presence: {
      state: normalizedPolicy.presenceEnabled ? 'available' : 'policy_disabled',
      optedInProfiles: eligible.length,
      online: people.length,
      people,
    },
    privacy: {
      ephemeralOnly: true,
      presenceIsNotProductivity: true,
      exposesLocalRecords: false,
      exposesTasks: false,
      exposesGold: false,
    },
  };
}

const exactly = (value, allowed, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new CeoFederationError('Federation response contains unsupported fields.', 502, code);
  }
};

export function sanitizeCeoFederationPresenceEnvelope(value, expected = {}) {
  exactly(value, new Set(['contract', 'version', 'targetEntityId', 'asOf', 'ttlMs', 'policy', 'presence', 'privacy']), 'ceo_federation_response_field_unsupported');
  if (value.contract !== CEO_FEDERATION_PRESENCE_CONTRACT || value.version !== CEO_FEDERATION_VERSION || value.targetEntityId !== expected.targetEntityId) {
    throw new CeoFederationError('Federation response contract mismatch.', 502, 'ceo_federation_contract_mismatch');
  }
  exactly(value.policy, new Set(['presenceEnabled', 'mode']), 'ceo_federation_policy_field_unsupported');
  exactly(value.presence, new Set(['state', 'optedInProfiles', 'online', 'people']), 'ceo_federation_presence_field_unsupported');
  exactly(value.privacy, new Set(['ephemeralOnly', 'presenceIsNotProductivity', 'exposesLocalRecords', 'exposesTasks', 'exposesGold']), 'ceo_federation_privacy_field_unsupported');
  if (value.policy.mode !== 'explicit-opt-in' || typeof value.policy.presenceEnabled !== 'boolean') throw new CeoFederationError('Federation presence policy is invalid.', 502, 'ceo_federation_policy_invalid');
  if (!['available', 'policy_disabled'].includes(value.presence.state) || !Array.isArray(value.presence.people) || value.presence.people.length > 200) throw new CeoFederationError('Federation presence payload is invalid.', 502, 'ceo_federation_presence_invalid');
  const ttlMs = Number(value.ttlMs);
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > COLLABORATION_PRESENCE_TTL_MS) throw new CeoFederationError('Federation presence TTL is invalid.', 502, 'ceo_federation_presence_ttl_invalid');
  const asOf = iso(value.asOf);
  if (expected.now) {
    const expectedNow = new Date(expected.now).getTime();
    const asOfMs = new Date(asOf).getTime();
    if (!Number.isFinite(expectedNow) || asOfMs > expectedNow + CEO_FEDERATION_CLOCK_SKEW_MS || asOfMs < expectedNow - ttlMs - CEO_FEDERATION_CLOCK_SKEW_MS) {
      throw new CeoFederationError('Federation presence response is stale.', 502, 'ceo_federation_presence_stale');
    }
  }
  const userIds = new Set();
  const people = value.presence.people.map((person) => {
    exactly(person, new Set(['userId', 'displayName', 'title', 'availability', 'surface']), 'ceo_federation_person_field_unsupported');
    const userId = bounded(person.userId, 100);
    const displayName = bounded(person.displayName, 80);
    if (!FEDERATION_USER_ID.test(userId) || !displayName || (person.title !== null && typeof person.title !== 'string')
      || !FEDERATION_AVAILABILITY.has(person.availability) || !FEDERATION_SURFACES.has(person.surface) || userIds.has(userId)) {
      throw new CeoFederationError('Federation presence person is invalid.', 502, 'ceo_federation_person_invalid');
    }
    userIds.add(userId);
    return {
      userId, displayName, title: bounded(person.title, 80) || null,
      availability: person.availability, surface: person.surface,
    };
  });
  const online = Number(value.presence.online);
  const optedInProfiles = Number(value.presence.optedInProfiles);
  if (!Number.isInteger(online) || online < 0 || online !== people.length || !Number.isInteger(optedInProfiles) || optedInProfiles < online) throw new CeoFederationError('Federation presence counts are invalid.', 502, 'ceo_federation_presence_count_invalid');
  const expectedState = value.policy.presenceEnabled ? 'available' : 'policy_disabled';
  if (value.presence.state !== expectedState || (!value.policy.presenceEnabled && (online !== 0 || optedInProfiles !== 0 || people.length !== 0))) {
    throw new CeoFederationError('Federation policy and presence state are inconsistent.', 502, 'ceo_federation_policy_state_mismatch');
  }
  if (value.privacy.ephemeralOnly !== true || value.privacy.presenceIsNotProductivity !== true || value.privacy.exposesLocalRecords !== false || value.privacy.exposesTasks !== false || value.privacy.exposesGold !== false) {
    throw new CeoFederationError('Federation privacy evidence is missing.', 502, 'ceo_federation_privacy_evidence_missing');
  }
  return { ...value, asOf, ttlMs, presence: { ...value.presence, online, optedInProfiles, people } };
}

export function federationKingdomMeta(entityId, displayName = '') {
  const base = CEO_FEDERATION_KINGDOMS[entityId] || { order: 99, realmName: displayName || entityId, mapPosition: 'unknown', landmark: 'citadel', gatewayPath: '/realm' };
  return { ...base, displayName: bounded(displayName, 80, entityId) };
}

export function buildCeoFederationWorld({ memberships = [], presenceByEntity = new Map(), stepUp = false, asOf = new Date(), filter = 'all' } = {}) {
  const kingdoms = memberships.filter((membership) => filter === 'all' || membership.entityId === filter).map((membership) => {
    const entity = membership.entity;
    const remote = presenceByEntity.get(entity.id);
    const meta = federationKingdomMeta(entity.id, entity.displayName);
    const gatewayAvailable = Boolean(entity.enabled && membership.status === 'active' && membership.localRole === 'DIRECTOR');
    return {
      id: entity.id, displayName: meta.displayName, realmName: meta.realmName, mapPosition: meta.mapPosition, landmark: meta.landmark,
      environment: entity.environment, businessProfile: entity.businessProfile,
      gateway: { available: gatewayAvailable, redirectPath: meta.gatewayPath, requiresStepUp: true },
      chat: { available: gatewayAvailable, href: `/ceo-inbox?entity=${encodeURIComponent(entity.id)}`, grantsRecordAccess: false },
      presence: remote?.ok ? remote.value.presence : { state: remote?.code === 'ceo_federation_policy_disabled' ? 'policy_disabled' : gatewayAvailable ? 'degraded' : 'disabled', optedInProfiles: 0, online: 0, people: [] },
      source: remote?.ok ? { asOf: remote.value.asOf, ttlMs: remote.value.ttlMs } : { asOf: null, ttlMs: COLLABORATION_PRESENCE_TTL_MS, errorCode: remote?.code || (gatewayAvailable ? 'ceo_federation_presence_unavailable' : 'ceo_federation_gateway_disabled') },
    };
  }).sort((left, right) => (CEO_FEDERATION_KINGDOMS[left.id]?.order || 99) - (CEO_FEDERATION_KINGDOMS[right.id]?.order || 99));
  return {
    contract: CEO_FEDERATION_CONTRACT, version: CEO_FEDERATION_VERSION, asOf: iso(asOf),
    identity: { stepUp: Boolean(stepUp) }, kingdoms,
    summary: { registered: kingdoms.length, gatewaysAvailable: kingdoms.filter((item) => item.gateway.available).length, presenceAvailable: kingdoms.filter((item) => item.presence.state === 'available').length, online: kingdoms.reduce((total, item) => total + item.presence.online, 0) },
    invariants: { separateEntityRealms: true, ssoGatewayOnly: true, explicitPresenceOptIn: true, crossEntityChatGrantsRecordAccess: false, presenceIsNotProductivity: true },
  };
}
