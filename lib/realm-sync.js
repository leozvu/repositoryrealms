import { createHash } from 'node:crypto';

export const REALM_SYNC_SCHEMA_VERSION = 1;
export const REALM_SYNC_STALE_AFTER_SECONDS = 90;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function isoDate(value, fallback = null) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function createRealmSnapshotRevision(snapshot) {
  const canonical = JSON.stringify(stableValue({
    source: snapshot?.source,
    bridge: snapshot?.bridge,
    profile: snapshot?.profile,
    operations: snapshot?.operations,
  }));
  return createHash('sha256').update(canonical).digest('hex');
}

export function createRealmSyncEnvelope(snapshot, { generatedAt = new Date(), profileUpdatedAt = null } = {}) {
  return {
    schemaVersion: REALM_SYNC_SCHEMA_VERSION,
    generatedAt: isoDate(generatedAt, new Date().toISOString()),
    staleAfterSeconds: REALM_SYNC_STALE_AFTER_SECONDS,
    revision: createRealmSnapshotRevision(snapshot),
    entities: {
      profileVersion: profileUpdatedAt ? isoDate(profileUpdatedAt) : null,
    },
  };
}

export function realmSnapshotEtag(sync) {
  const revision = String(sync?.revision || '').trim();
  return revision ? `"realm-${revision}"` : null;
}

export function realmSnapshotMatchesEtag(headerValue, sync) {
  const etag = realmSnapshotEtag(sync);
  if (!etag || !headerValue) return false;
  return String(headerValue)
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === '*' || value === etag);
}

export function realmSnapshotHeaders(sync) {
  const etag = realmSnapshotEtag(sync);
  return {
    'Cache-Control': 'private, no-cache, no-store, max-age=0',
    Vary: 'Cookie',
    ...(etag ? { ETag: etag } : {}),
    ...(sync?.revision ? { 'X-Realm-Revision': sync.revision } : {}),
    ...(sync?.generatedAt ? { 'X-Realm-Generated-At': sync.generatedAt } : {}),
  };
}

export function normalizeRealmProfileVersion(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const normalized = isoDate(value);
  if (!normalized || normalized !== value) return undefined;
  return normalized;
}
