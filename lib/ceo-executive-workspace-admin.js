import { isDirector } from './perm.js';
import { requireCeoStepUp } from './ceo-identity.js';
import { requireCeoPortalSession } from './ceo-identity-admin.js';
import { sanitizeCeoSyncErrorCode } from './ceo-entity-registry.js';
import { prepareCeoRegistrySync, recordCeoRegistrySyncFailure, recordCeoRegistrySyncSuccess } from './ceo-entity-registry-admin.js';
import { assertCeoRolloutCapability } from './ceo-rollout.js';
import { assertCeoDashboardUpstreamOrigin } from './ceo-unified-dashboard.js';
import {
  CEO_EXECUTIVE_FETCH_TIMEOUT_MS,
  CeoExecutiveContractError,
  sanitizeCeoExecutiveSnapshot,
} from './ceo-executive-contract.js';

const resolveServerSecret = (name) => process.env[name];
const resolveAllowedOrigins = (entity) => {
  const suffix = String(entity.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return String(process.env[`CEO_ENTITY_${suffix}_ALLOWED_ORIGINS`] || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
};

function requireDirector(user) {
  if (!user) throw new CeoExecutiveContractError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoExecutiveContractError('Director scope required.', 403, 'ceo_executive_director_required');
}

function safeErrorCode(error) {
  if (error?.name === 'AbortError') return 'ceo_executive_upstream_timeout';
  return sanitizeCeoSyncErrorCode(error?.code || 'ceo_executive_upstream_unavailable');
}

async function readJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > 256 * 1024) {
    throw new CeoExecutiveContractError('Executive snapshot is too large.', 502, 'ceo_executive_snapshot_too_large');
  }
  try { return JSON.parse(text); } catch {
    throw new CeoExecutiveContractError('Entity returned invalid JSON.', 502, 'ceo_executive_upstream_json_invalid');
  }
}

async function fetchOne(db, entity, context) {
  const {
    now, fetchImpl, secretResolver, allowedOriginResolver, timeoutMs,
  } = context;
  await assertCeoRolloutCapability(db, entity.id, 'dashboard.read', { now });
  const origin = assertCeoDashboardUpstreamOrigin(entity, allowedOriginResolver(entity));
  const prepared = await prepareCeoRegistrySync(db, entity.id, { now, secretResolver });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestOptions = {
      method: 'GET',
      headers: {
        Accept: 'application/json', Authorization: `Bearer ${prepared.credential}`,
        'X-CEO-Entity-ID': entity.id, 'User-Agent': 'RepositoryRealms-CEO-Portal/2.0',
      },
      cache: 'no-store', redirect: 'error', signal: controller.signal,
    };
    const capabilityResponse = await fetchImpl(new URL('/api/ceo/v1/capabilities', origin), requestOptions);
    if (!capabilityResponse.ok) throw new CeoExecutiveContractError('Entity capabilities failed.', 502, `ceo_executive_capabilities_http_${capabilityResponse.status}`);
    const capabilities = await readJson(capabilityResponse);
    if (capabilities?.entityId !== entity.id) {
      throw new CeoExecutiveContractError('Entity capability audience mismatch.', 502, 'ceo_executive_capabilities_mismatch');
    }
    if (capabilities?.endpoints?.executiveSnapshot !== '/api/ceo/v2/executive-snapshot') {
      return { id: entity.id, displayName: entity.displayName, status: 'not_supported', snapshot: null, errorCode: null };
    }
    const response = await fetchImpl(new URL(capabilities.endpoints.executiveSnapshot, origin), requestOptions);
    if (!response.ok) throw new CeoExecutiveContractError('Entity executive snapshot failed.', 502, `ceo_executive_upstream_http_${response.status}`);
    const snapshot = sanitizeCeoExecutiveSnapshot(await readJson(response), entity.id);
    await recordCeoRegistrySyncSuccess(db, entity.id, now).catch(() => {});
    return { id: entity.id, displayName: entity.displayName, status: 'ready', snapshot, errorCode: null };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    await recordCeoRegistrySyncFailure(db, entity.id, errorCode, now).catch(() => {});
    return { id: entity.id, displayName: entity.displayName, status: 'degraded', snapshot: null, errorCode };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCeoExecutiveWorkspace(db, user, rawToken, { entityId = 'all' } = {}, context = {}) {
  requireDirector(user);
  const now = context.now || new Date();
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now, touch: false });
  requireCeoStepUp(session, now);
  const registry = await db.ceoEntityRegistry.findMany({
    where: { enabled: true }, orderBy: { displayName: 'asc' },
  });
  const memberships = await db.ceoEntityMembership.findMany({
    where: { identityId: session.identityId, status: 'active', localRole: 'DIRECTOR' },
    select: { entityId: true },
  });
  const allowed = new Set(memberships.map((row) => row.entityId));
  const requested = String(entityId || 'all').trim().toLowerCase();
  const targets = registry.filter((row) => allowed.has(row.id) && (requested === 'all' || row.id === requested));
  if (requested !== 'all' && !targets.length) {
    throw new CeoExecutiveContractError('Entity is unavailable to this CEO identity.', 404, 'ceo_executive_entity_unavailable');
  }
  const options = {
    now,
    fetchImpl: context.fetchImpl || fetch,
    secretResolver: context.secretResolver || resolveServerSecret,
    allowedOriginResolver: context.allowedOriginResolver || resolveAllowedOrigins,
    timeoutMs: context.timeoutMs || CEO_EXECUTIVE_FETCH_TIMEOUT_MS,
  };
  const entities = await Promise.all(targets.map((entity) => fetchOne(db, entity, options)));
  return {
    version: 2,
    generatedAt: now.toISOString(),
    entities,
    summary: {
      registered: targets.length,
      ready: entities.filter((row) => row.status === 'ready').length,
      degraded: entities.filter((row) => row.status === 'degraded').length,
      notSupported: entities.filter((row) => row.status === 'not_supported').length,
    },
    invariants: {
      snapshotV1Unchanged: true,
      currenciesCombined: false,
      gmvClassifiedAsRevenue: false,
      directEntityWrites: false,
    },
  };
}
