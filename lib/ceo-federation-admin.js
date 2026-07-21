import { normalizeCeoScopes, ceoPortalSessionState } from './ceo-identity.js';
import { requireCeoPortalSession } from './ceo-identity-admin.js';
import { normalizeCeoRegistryEntityId, parseCeoRegistryCapabilities, sanitizeCeoSyncErrorCode } from './ceo-entity-registry.js';
import { prepareCeoRegistrySync, recordCeoRegistrySyncFailure, recordCeoRegistrySyncSuccess } from './ceo-entity-registry-admin.js';
import { assertCeoDashboardUpstreamOrigin } from './ceo-unified-dashboard.js';
import {
  CEO_FEDERATION_FETCH_TIMEOUT_MS,
  CEO_FEDERATION_MAX_RESPONSE_BYTES,
  CEO_FEDERATION_SCOPE,
  CeoFederationError,
  buildCeoFederationWorld,
  sanitizeCeoFederationPresenceEnvelope,
} from './ceo-federation.js';
import { isDirector } from './perm.js';

const resolveSecret = (name) => process.env[name];
const resolveAllowedOrigins = (entity) => {
  const suffix = String(entity.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return String(process.env[`CEO_ENTITY_${suffix}_ALLOWED_ORIGINS`] || '').split(',').map((value) => value.trim()).filter(Boolean);
};

function requireDirector(user) {
  if (!user) throw new CeoFederationError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoFederationError('Director scope required.', 403, 'ceo_federation_director_required');
}

function safeErrorCode(error) {
  if (error?.name === 'AbortError') return 'ceo_federation_target_timeout';
  return sanitizeCeoSyncErrorCode(error?.code || 'ceo_federation_target_unavailable');
}

async function readJson(response) {
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > CEO_FEDERATION_MAX_RESPONSE_BYTES) throw new CeoFederationError('Federation response is too large.', 502, 'ceo_federation_response_too_large');
  try { return JSON.parse(raw); } catch { throw new CeoFederationError('Federation response is invalid JSON.', 502, 'ceo_federation_response_json_invalid'); }
}

async function readPresence(db, session, entity, context) {
  const now = context.now;
  const origin = assertCeoDashboardUpstreamOrigin(entity, context.allowedOriginResolver(entity));
  const prepared = await prepareCeoRegistrySync(db, entity.id, { now, secretResolver: context.secretResolver });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs);
  try {
    const response = await context.fetchImpl(new URL('/api/ceo/v1/federation/presence', origin), {
      method: 'GET',
      headers: {
        Accept: 'application/json', Authorization: `Bearer ${prepared.credential}`,
        'User-Agent': 'RepositoryRealms-CEO-Portal/1.0', 'X-CEO-Entity-ID': entity.id,
        'X-CEO-Federation-Scope': CEO_FEDERATION_SCOPE, 'X-CEO-Actor-Subject': session.identity.subject,
      },
      cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    const body = await readJson(response);
    if (!response.ok) throw new CeoFederationError(body?.error || 'Federation target rejected the request.', response.status >= 500 ? 502 : response.status, sanitizeCeoSyncErrorCode(body?.code || `ceo_federation_target_http_${response.status}`));
    const value = sanitizeCeoFederationPresenceEnvelope(body, { targetEntityId: entity.id, now });
    await recordCeoRegistrySyncSuccess(db, entity.id, now).catch(() => {});
    return { ok: true, value };
  } catch (error) {
    const code = safeErrorCode(error);
    if (!['ceo_registry_entity_disabled', 'ceo_registry_circuit_open'].includes(code)) await recordCeoRegistrySyncFailure(db, entity.id, code, now).catch(() => {});
    return { ok: false, code };
  } finally { clearTimeout(timer); }
}

export async function loadCeoFederationWorld(db, user, rawToken, { entityId = 'all' } = {}, context = {}) {
  requireDirector(user);
  const now = context.now || new Date();
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now });
  const filter = String(entityId || 'all').trim().toLowerCase() === 'all' ? 'all' : normalizeCeoRegistryEntityId(entityId);
  const memberships = await db.ceoEntityMembership.findMany({ where: { identityId: session.identityId, status: 'active' }, include: { entity: true } });
  const eligible = memberships.filter((membership) => membership.localRole === 'DIRECTOR' && normalizeCeoScopes(membership.scopes).includes(CEO_FEDERATION_SCOPE));
  if (!eligible.length) throw new CeoFederationError('CEO membership does not grant Realm federation.', 403, 'ceo_federation_membership_required');
  if (filter !== 'all' && !eligible.some((membership) => membership.entityId === filter)) throw new CeoFederationError('Federation kingdom is unavailable.', 404, 'ceo_federation_kingdom_not_found');
  const targets = eligible.filter((membership) => filter === 'all' || membership.entityId === filter);
  const requestContext = {
    now, fetchImpl: context.fetchImpl || fetch, secretResolver: context.secretResolver || resolveSecret,
    allowedOriginResolver: context.allowedOriginResolver || resolveAllowedOrigins,
    timeoutMs: context.timeoutMs || CEO_FEDERATION_FETCH_TIMEOUT_MS,
  };
  const settled = await Promise.all(targets.map(async (membership) => {
    const entity = membership.entity;
    if (!entity.enabled) return [entity.id, { ok: false, code: 'ceo_federation_gateway_disabled' }];
    if (!parseCeoRegistryCapabilities(entity.capabilities).includes('people')) return [entity.id, { ok: false, code: 'ceo_federation_people_capability_missing' }];
    return [entity.id, await readPresence(db, session, entity, requestContext)];
  }));
  const world = buildCeoFederationWorld({ memberships: targets, presenceByEntity: new Map(settled), stepUp: ceoPortalSessionState(session, now).stepUp, asOf: now, filter });
  await db.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_federation_world_viewed', entity: 'ceo_realm_federation', refId: filter, detail: `kingdoms=${world.summary.registered}; presenceAvailable=${world.summary.presenceAvailable}; online=${world.summary.online}` } });
  return world;
}
