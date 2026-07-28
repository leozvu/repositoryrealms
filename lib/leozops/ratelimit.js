// Sprint 1A — T4: in-memory per-key rate limiter (sliding window).
//
// LIMITATION (documented, accepted for S1A): state lives in a single process's
// memory. On Vercel's serverless runtime each instance keeps its own buckets, so
// the effective limit is per-instance, not globally shared — under fan-out the
// real ceiling can exceed 60/hr. This is a best-effort guard, not a hard quota;
// a shared store (e.g. Upstash/Redis) is the follow-up if a strict limit is
// needed.

const buckets = new Map(); // bucketKey -> number[] (hit timestamps, ms)

export function checkRateLimit(bucketKey, { now, limit = 60, windowMs = 3600_000 } = {}) {
  const t = typeof now === 'number' ? now : Date.now();
  const recent = (buckets.get(bucketKey) || []).filter(ts => t - ts < windowMs);

  if (recent.length >= limit) {
    buckets.set(bucketKey, recent);
    const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000));
    return { ok: false, remaining: 0, retryAfter };
  }

  recent.push(t);
  buckets.set(bucketKey, recent);
  return { ok: true, remaining: limit - recent.length, retryAfter: 0 };
}

// Test-only: clear all buckets so cases don't leak into each other.
export function _resetRateLimit() {
  buckets.clear();
}
