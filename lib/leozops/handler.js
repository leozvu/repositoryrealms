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
//   5. If-None-Match matches our ETag        -> 304, empty body
//   6. otherwise                             -> 200 with the T1 snapshot payload
//
// T4 additions on the success/near-success path: ETag = the snapshot_id as an
// RFC 9110 QUOTED validator ("sha256:..."), Cache-Control: private, no-cache,
// X-Correlation-ID (strict-UUID echo or generated), and a structured audit log
// line per request that contains ZERO PII.
//
// G1 corrective (correlation-id confidentiality): a caller-provided
// X-Correlation-ID is accepted ONLY when it is a strict UUID. Anything else —
// oversized, control characters, email-like, credential/token-like, malformed —
// is DISCARDED and replaced with a fresh UUID. Rejected caller input is never
// echoed in headers and never written to logs.

import crypto from 'crypto';
import { buildSnapshot } from './projector.js';
import { verifyReadKey } from './auth.js';
import { checkRateLimit } from './ratelimit.js';
import { correlationIdOf, headerOf, ifNoneMatchSatisfied, pathOf } from './http.js';

const ROUTE_PATH = '/api/integrations/leozops/v1/lead-snapshot';

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
  const correlationId = correlationIdOf(req, uuid);
  const path = pathOf(req, ROUTE_PATH);

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

  // 5/6. Read-only data pull + de-identified projection. Fail closed with a
  // generic response and the same payload-free audit contract if the data
  // source is unavailable; never serialize/log the underlying DB error.
  let snapshot;
  try {
    const rawLeads = await loadLeads();
    const generatedAt = new Date(now()).toISOString();
    snapshot = buildSnapshot(rawLeads, { generatedAt });
  } catch {
    audit(500, { fingerprint });
    return {
      status: 500,
      headers: withCorr({ 'Cache-Control': 'private, no-store' }),
      body: { error: 'snapshot unavailable' },
    };
  }
  // snapshot_id keeps its unquoted `sha256:...` form in the body and audit log;
  // the ETag HEADER is the RFC 9110 quoted form of that same value. generated_at
  // is excluded from the hash by the projector, so the tag is time-stable.
  const snapshotId = snapshot.snapshot_id;
  const etag = `"${snapshotId}"`;
  const cacheHeaders = withCorr({ ETag: etag, 'Cache-Control': 'private, no-cache' });

  // Conditional GET: If-None-Match (quoted / weak / list / '*') -> 304, empty body.
  if (ifNoneMatchSatisfied(headerOf(req, 'if-none-match'), etag)) {
    audit(304, { fingerprint, recordCount: snapshot.leads.length, snapshotId });
    return { status: 304, headers: cacheHeaders, body: null };
  }

  audit(200, { fingerprint, recordCount: snapshot.leads.length, snapshotId });
  return { status: 200, headers: cacheHeaders, body: snapshot };
}
