// Sprint 1A — T3/T4: feature-flagged, GET-only snapshot handler (transport-agnostic).
//
// Pure-ish core so it can be unit-tested without Next/Prisma: returns a plain
// { status, headers, body } that the route adapter turns into a Response.
//
// Safety gates, in order:
//   1. LEOZOPS_SNAPSHOT_ENABLED !== 'true'  -> 404 (route is effectively absent)
//   2. method !== GET                        -> 405
//   3. bad/missing bearer key                -> 401
//   4. over rate limit (60/hr per key)       -> 429 + Retry-After
//   5. ETag (snapshot_id) matches            -> 304, empty body
//   6. otherwise                             -> 200 with the T1 snapshot payload
//
// T4 additions on the success/near-success path: ETag = snapshot_id,
// Cache-Control: private, no-cache, X-Correlation-ID (echo or generated), and a
// structured audit log line per request that contains ZERO PII.

import crypto from 'crypto';
import { buildSnapshot } from './projector.js';
import { verifyReadKey } from './auth.js';
import { checkRateLimit } from './ratelimit.js';

const ROUTE_PATH = '/api/integrations/leozops/v1/lead-snapshot';

function pathOf(req) {
  try { return new URL(req.url).pathname; } catch { return ROUTE_PATH; }
}

function headerOf(req, name) {
  return (req.headers && req.headers.get && req.headers.get(name)) || null;
}

export async function handleSnapshot(req, opts = {}) {
  const {
    env = {},
    loadLeads,
    now = () => Date.now(),
    uuid = () => crypto.randomUUID(),
    log = (...a) => console.log(...a),
    rateLimit = { limit: 60, windowMs: 3600_000 },
  } = opts;

  // 1. Feature flag — off/absent => 404, route is effectively absent (no log).
  if (env.LEOZOPS_SNAPSHOT_ENABLED !== 'true') {
    return { status: 404, headers: {}, body: { error: 'not found' } };
  }

  const start = now();
  const correlationId = headerOf(req, 'x-correlation-id') || uuid();
  const path = pathOf(req);

  // Emit one structured audit line. NEVER include PII — only counts + ids.
  const audit = (status, { fingerprint = null, recordCount = null, snapshotId = null } = {}) => {
    log(JSON.stringify({
      evt: 'leozops_lead_snapshot',
      correlation_id: correlationId,
      key_fingerprint: fingerprint,
      path,
      status,
      latency_ms: now() - start,
      record_count: recordCount,
      snapshot_id: snapshotId,
    }));
  };

  const withCorr = (extra = {}) => ({ 'X-Correlation-ID': correlationId, ...extra });

  // 2. GET only.
  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    audit(405);
    return { status: 405, headers: withCorr({ Allow: 'GET' }), body: { error: 'method not allowed' } };
  }

  // 3. Bearer key.
  const { ok, fingerprint } = verifyReadKey(req, env);
  if (!ok) {
    audit(401, { fingerprint });
    return { status: 401, headers: withCorr(), body: { error: 'unauthorized' } };
  }

  // 4. Rate limit — 60 req/hour per key. Bucket by the expected hash (per key).
  const rl = checkRateLimit(env.LEOZOPS_READ_KEY_HASH, { now: start, limit: rateLimit.limit, windowMs: rateLimit.windowMs });
  if (!rl.ok) {
    audit(429, { fingerprint });
    return {
      status: 429,
      headers: withCorr({ 'Retry-After': String(rl.retryAfter) }),
      body: { error: 'rate limit exceeded' },
    };
  }

  // 5/6. Read-only data pull + de-identified projection.
  const rawLeads = await loadLeads();
  const generatedAt = new Date(now()).toISOString();
  const snapshot = buildSnapshot(rawLeads, { generatedAt });
  const etag = snapshot.snapshot_id;
  const cacheHeaders = withCorr({ ETag: etag, 'Cache-Control': 'private, no-cache' });

  // Conditional GET: If-None-Match match -> 304 with empty body.
  if (headerOf(req, 'if-none-match') === etag) {
    audit(304, { fingerprint, recordCount: snapshot.leads.length, snapshotId: etag });
    return { status: 304, headers: cacheHeaders, body: null };
  }

  audit(200, { fingerprint, recordCount: snapshot.leads.length, snapshotId: etag });
  return { status: 200, headers: cacheHeaders, body: snapshot };
}
