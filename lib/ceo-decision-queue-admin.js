import { isDirector } from './perm.js';
import { normalizeCeoScopes } from './ceo-identity.js';
import { normalizeCeoRegistryEntityId, sanitizeCeoSyncErrorCode } from './ceo-entity-registry.js';
import { prepareCeoRegistrySync } from './ceo-entity-registry-admin.js';
import { assertCeoDashboardUpstreamOrigin } from './ceo-unified-dashboard.js';
import { assertCeoRolloutCapability } from './ceo-rollout.js';
import {
  buildCeoUnifiedDecisionQueue,
  CEO_DECISION_FETCH_TIMEOUT_MS,
  CEO_DECISION_MAX_BYTES,
  CeoDecisionQueueError,
  sanitizeCeoDecisionFeed,
} from './ceo-decision-queue.js';

const resolveSecret = (name) => process.env[name];
const resolveAllowedOrigins = (entity) => {
  const suffix = String(entity.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return String(process.env[`CEO_ENTITY_${suffix}_ALLOWED_ORIGINS`] || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
};

function requireDirector(user) {
  if (!user) throw new CeoDecisionQueueError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoDecisionQueueError('Director scope required.', 403, 'ceo_decision_director_required');
}

function normalizeFilter(value) {
  const filter = String(value || 'all').trim().toLowerCase();
  return filter === 'all' ? 'all' : normalizeCeoRegistryEntityId(filter);
}

function safeErrorCode(error) {
  if (error?.name === 'AbortError') return 'ceo_decision_upstream_timeout';
  return sanitizeCeoSyncErrorCode(error?.code || 'ceo_decision_upstream_unavailable');
}

async function readJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > CEO_DECISION_MAX_BYTES) {
    throw new CeoDecisionQueueError('Entity decision feed is too large.', 502, 'ceo_decision_feed_too_large');
  }
  try { return JSON.parse(text); } catch {
    throw new CeoDecisionQueueError('Entity decision feed is invalid JSON.', 502, 'ceo_decision_upstream_json_invalid');
  }
}

async function fetchEntityFeed(db, entity, { now, fetchImpl, secretResolver, allowedOriginResolver, timeoutMs }) {
  await assertCeoRolloutCapability(db, entity.id, 'decisions.read', { now });
  const origin = assertCeoDashboardUpstreamOrigin(entity, allowedOriginResolver(entity));
  const prepared = await prepareCeoRegistrySync(db, entity.id, { now, secretResolver });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL('/api/ceo/v1/decisions', origin), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${prepared.credential}`,
        'X-CEO-Entity-ID': entity.id,
        'User-Agent': 'RepositoryRealms-CEO-Portal/1.0',
      },
      cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) throw new CeoDecisionQueueError('Entity decision feed failed.', 502, `ceo_decision_upstream_http_${response.status}`);
    return sanitizeCeoDecisionFeed(await readJson(response), entity, now);
  } finally { clearTimeout(timer); }
}

export async function loadCeoUnifiedDecisionQueue(db, user, session, { entityId = 'all', now = new Date() } = {}, {
  fetchImpl = fetch,
  secretResolver = resolveSecret,
  allowedOriginResolver = resolveAllowedOrigins,
  timeoutMs = CEO_DECISION_FETCH_TIMEOUT_MS,
} = {}) {
  requireDirector(user);
  if (!session?.identityId) throw new CeoDecisionQueueError('CEO session is required.', 401, 'ceo_decision_session_required');
  const filter = normalizeFilter(entityId);
  const [registryEntities, memberships] = await Promise.all([
    db.ceoEntityRegistry.findMany({ orderBy: { displayName: 'asc' } }),
    db.ceoEntityMembership.findMany({ where: { identityId: session.identityId, status: 'active' } }),
  ]);
  if (filter !== 'all' && !registryEntities.some((entity) => entity.id === filter)) {
    throw new CeoDecisionQueueError('Entity is not registered.', 404, 'ceo_decision_entity_not_found');
  }
  const allowedIds = new Set(memberships
    .filter((membership) => normalizeCeoScopes(membership.scopes).includes('entity.open'))
    .map((membership) => membership.entityId));
  const selected = registryEntities.filter((entity) => entity.enabled && allowedIds.has(entity.id) && (filter === 'all' || entity.id === filter));
  const settled = await Promise.all(selected.map(async (entity) => {
    try {
      return { ok: true, feed: await fetchEntityFeed(db, entity, { now, fetchImpl, secretResolver, allowedOriginResolver, timeoutMs }) };
    } catch (error) {
      return { ok: false, entityId: entity.id, code: safeErrorCode(error) };
    }
  }));
  return buildCeoUnifiedDecisionQueue({
    feeds: settled.filter((result) => result.ok).map((result) => result.feed),
    errors: settled.filter((result) => !result.ok).map(({ entityId: id, code }) => ({ entityId: id, code })),
    registryEntities: registryEntities.filter((entity) => allowedIds.has(entity.id)),
    entityId: filter,
    now,
  });
}
