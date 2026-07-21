import { isDirector } from './perm.js';
import { normalizeCeoRegistryEntityId, parseCeoRegistryCapabilities, sanitizeCeoSyncErrorCode } from './ceo-entity-registry.js';
import {
  prepareCeoRegistrySync,
  recordCeoRegistrySyncFailure,
  recordCeoRegistrySyncSuccess,
} from './ceo-entity-registry-admin.js';
import {
  buildCeoUnifiedDashboard,
  CEO_DASHBOARD_FETCH_TIMEOUT_MS,
  CEO_DASHBOARD_FRESH_MS,
  CEO_DASHBOARD_STALE_MS,
  CeoDashboardError,
  assertCeoDashboardUpstreamOrigin,
  sanitizeCeoRemoteSnapshot,
} from './ceo-unified-dashboard.js';

const resolveServerSecret = (name) => process.env[name];
const resolveAllowedOrigins = (entity) => {
  const suffix = String(entity.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return String(process.env[`CEO_ENTITY_${suffix}_ALLOWED_ORIGINS`] || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
};

function requireDirector(user) {
  if (!user) throw new CeoDashboardError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoDashboardError('Director scope required.', 403, 'ceo_dashboard_director_required');
}

function normalizeFilter(value) {
  const filter = String(value || 'all').trim().toLowerCase();
  return filter === 'all' ? 'all' : normalizeCeoRegistryEntityId(filter);
}

function safeErrorCode(error) {
  if (error?.name === 'AbortError') return 'ceo_dashboard_upstream_timeout';
  return sanitizeCeoSyncErrorCode(error?.code || 'ceo_dashboard_upstream_unavailable');
}

async function readResponseJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > 256 * 1024) {
    throw new CeoDashboardError('Entity snapshot is too large.', 502, 'ceo_dashboard_snapshot_too_large');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CeoDashboardError('Entity returned invalid JSON.', 502, 'ceo_dashboard_upstream_json_invalid');
  }
}

async function refreshOneEntity(db, user, entity, {
  now,
  fetchImpl,
  secretResolver,
  allowedOriginResolver,
  timeoutMs,
  freshMs,
  staleMs,
}) {
  const upstreamOrigin = assertCeoDashboardUpstreamOrigin(entity, allowedOriginResolver(entity));
  const prepared = await prepareCeoRegistrySync(db, entity.id, { now, secretResolver });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const domains = parseCeoRegistryCapabilities(entity.capabilities).join(',');
    const url = new URL('/api/ceo/v1/snapshot', upstreamOrigin);
    if (domains) url.searchParams.set('domains', domains);
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${prepared.credential}`,
        'X-CEO-Entity-ID': entity.id,
        'User-Agent': 'RepositoryRealms-CEO-Portal/1.0',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CeoDashboardError('Entity snapshot request failed.', 502, `ceo_dashboard_upstream_http_${response.status}`);
    }
    const snapshot = sanitizeCeoRemoteSnapshot(await readResponseJson(response), entity, now);
    const fetchedAt = now;
    await db.$transaction(async (tx) => {
      await tx.ceoEntitySnapshotCache.upsert({
        where: { entityId: entity.id },
        create: {
          entityId: entity.id,
          contractVersion: snapshot.contractVersion,
          schemaVersion: snapshot.schemaVersion,
          snapshotJson: JSON.stringify(snapshot),
          sourceAsOf: new Date(snapshot.asOf),
          fetchedAt,
          freshUntil: new Date(fetchedAt.getTime() + freshMs),
          staleUntil: new Date(fetchedAt.getTime() + staleMs),
        },
        update: {
          contractVersion: snapshot.contractVersion,
          schemaVersion: snapshot.schemaVersion,
          snapshotJson: JSON.stringify(snapshot),
          sourceAsOf: new Date(snapshot.asOf),
          fetchedAt,
          freshUntil: new Date(fetchedAt.getTime() + freshMs),
          staleUntil: new Date(fetchedAt.getTime() + staleMs),
        },
      });
      await recordCeoRegistrySyncSuccess(tx, entity.id, now);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name,
          action: 'ceo_dashboard_snapshot_refreshed',
          entity: 'ceo_entity_snapshot_cache',
          refId: entity.id,
          detail: `contractVersion=${snapshot.contractVersion}; sourceAsOf=${snapshot.asOf}; domains=${Object.keys(snapshot.domains).join(',')}`,
        },
      });
    });
    return { entityId: entity.id, ok: true, sourceAsOf: snapshot.asOf };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCeoUnifiedDashboard(db, user, { entityId = 'all', now = new Date() } = {}) {
  requireDirector(user);
  const filter = normalizeFilter(entityId);
  const registryEntities = await db.ceoEntityRegistry.findMany({ orderBy: [{ environment: 'asc' }, { displayName: 'asc' }] });
  if (filter !== 'all' && !registryEntities.some((entity) => entity.id === filter)) {
    throw new CeoDashboardError('Entity is not registered.', 404, 'ceo_dashboard_entity_not_found');
  }
  const selectedIds = registryEntities.filter((entity) => filter === 'all' || entity.id === filter).map((entity) => entity.id);
  const caches = selectedIds.length
    ? await db.ceoEntitySnapshotCache.findMany({ where: { entityId: { in: selectedIds } } })
    : [];
  return buildCeoUnifiedDashboard({ registryEntities, caches, now, entityId: filter });
}

export async function refreshCeoUnifiedDashboard(db, user, { entityId = 'all', force = false } = {}, {
  now = new Date(),
  fetchImpl = fetch,
  secretResolver = resolveServerSecret,
  allowedOriginResolver = resolveAllowedOrigins,
  timeoutMs = CEO_DASHBOARD_FETCH_TIMEOUT_MS,
  freshMs = CEO_DASHBOARD_FRESH_MS,
  staleMs = CEO_DASHBOARD_STALE_MS,
} = {}) {
  requireDirector(user);
  const filter = normalizeFilter(entityId);
  const registryEntities = await db.ceoEntityRegistry.findMany({ orderBy: [{ environment: 'asc' }, { displayName: 'asc' }] });
  if (filter !== 'all' && !registryEntities.some((entity) => entity.id === filter)) {
    throw new CeoDashboardError('Entity is not registered.', 404, 'ceo_dashboard_entity_not_found');
  }
  const eligible = registryEntities.filter((entity) => entity.enabled && (filter === 'all' || entity.id === filter));
  const currentCaches = eligible.length
    ? await db.ceoEntitySnapshotCache.findMany({ where: { entityId: { in: eligible.map((entity) => entity.id) } } })
    : [];
  const freshIds = new Set(currentCaches.filter((cache) => new Date(cache.freshUntil) > now).map((cache) => cache.entityId));
  const targets = force ? eligible : eligible.filter((entity) => !freshIds.has(entity.id));
  const settled = await Promise.all(targets.map(async (entity) => {
    try {
      return await refreshOneEntity(db, user, entity, {
        now, fetchImpl, secretResolver, allowedOriginResolver, timeoutMs, freshMs, staleMs,
      });
    } catch (error) {
      const code = safeErrorCode(error);
      if (!['ceo_registry_entity_disabled', 'ceo_registry_circuit_open'].includes(code)) {
        try { await recordCeoRegistrySyncFailure(db, entity.id, code, now); } catch {}
      }
      return { entityId: entity.id, ok: false, code };
    }
  }));
  const dashboard = await loadCeoUnifiedDashboard(db, user, { entityId: filter, now });
  return {
    ...dashboard,
    refresh: {
      attempted: targets.length,
      succeeded: settled.filter((item) => item.ok).length,
      failed: settled.filter((item) => !item.ok).length,
      skippedFresh: eligible.length - targets.length,
      results: settled,
    },
  };
}
