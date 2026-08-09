// Sprint 1B — feature-flagged, GET-only Lead Operations Brief handler.
// The brief key is deliberately separate from the Sprint 1A snapshot key.

import crypto from 'crypto';
import { verifyBearerHash } from './auth.js';
import { buildLeadBrief } from './brief-projector.js';
import { correlationIdOf, headerOf, ifNoneMatchSatisfied, pathOf } from './http.js';
import { checkRateLimit } from './ratelimit.js';

const ROUTE_PATH = '/api/integrations/leozops/v1/lead-brief';

export async function handleLeadBrief(req, opts = {}) {
  const {
    env = {},
    loadLeads,
    now = () => Date.now(),
    uuid = () => crypto.randomUUID(),
    log = (...args) => console.log(...args),
    rateLimit = { limit: 60, windowMs: 3_600_000 },
  } = opts;

  if (env.LEOZOPS_BRIEF_ENABLED !== 'true') {
    return { status: 404, headers: {}, body: { error: 'not found' } };
  }

  const start = now();
  const correlationId = correlationIdOf(req, uuid);
  const requestPath = pathOf(req, ROUTE_PATH);
  const withCorrelation = (extra = {}) => ({ 'X-Correlation-ID': correlationId, ...extra });

  const audit = (status, {
    fingerprint = null,
    recordCount = null,
    signalCount = null,
    briefId = null,
    sourceSnapshotId = null,
  } = {}) => {
    log(JSON.stringify({
      evt: 'leozops_lead_brief',
      correlation_id: correlationId,
      key_fingerprint: fingerprint,
      path: requestPath,
      status,
      latency_ms: now() - start,
      record_count: recordCount,
      signal_count: signalCount,
      brief_id: briefId,
      source_snapshot_id: sourceSnapshotId,
    }));
  };

  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    audit(405);
    return {
      status: 405,
      headers: withCorrelation({ Allow: 'GET' }),
      body: { error: 'method not allowed' },
    };
  }

  const expectedHash = env.LEOZOPS_BRIEF_READ_KEY_HASH;
  const { ok, fingerprint } = verifyBearerHash(req, expectedHash);
  if (!ok) {
    audit(401, { fingerprint });
    return { status: 401, headers: withCorrelation(), body: { error: 'unauthorized' } };
  }

  const rate = checkRateLimit('lead-brief:' + expectedHash, {
    now: start,
    limit: rateLimit.limit,
    windowMs: rateLimit.windowMs,
  });
  if (!rate.ok) {
    audit(429, { fingerprint });
    return {
      status: 429,
      headers: withCorrelation({ 'Retry-After': String(rate.retryAfter) }),
      body: { error: 'rate limit exceeded' },
    };
  }

  let brief;
  try {
    const rawLeads = await loadLeads();
    const generatedAt = new Date(now()).toISOString();
    brief = buildLeadBrief(rawLeads, {
      generatedAt,
      asOf: generatedAt.slice(0, 10),
    });
  } catch {
    audit(500, { fingerprint });
    return {
      status: 500,
      headers: withCorrelation({ 'Cache-Control': 'private, no-store' }),
      body: { error: 'brief unavailable' },
    };
  }

  const etag = `"${brief.brief_id}"`;
  const cacheHeaders = withCorrelation({ ETag: etag, 'Cache-Control': 'private, no-cache' });
  const auditFacts = {
    fingerprint,
    recordCount: brief.metrics.total_leads,
    signalCount: brief.signals.length,
    briefId: brief.brief_id,
    sourceSnapshotId: brief.source_snapshot_id,
  };

  if (ifNoneMatchSatisfied(headerOf(req, 'if-none-match'), etag)) {
    audit(304, auditFacts);
    return { status: 304, headers: cacheHeaders, body: null };
  }

  audit(200, auditFacts);
  return { status: 200, headers: cacheHeaders, body: brief };
}
