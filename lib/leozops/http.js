// Shared HTTP safety helpers for the isolated, read-only LeozOps routes.
// Keep these transport-agnostic so the contracts can be tested without Next.

export function pathOf(req, fallbackPath) {
  try { return new URL(req.url).pathname; } catch { return fallbackPath; }
}

export function headerOf(req, name) {
  return (req.headers && req.headers.get && req.headers.get(name)) || null;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Caller input is accepted only when it is exactly a UUID. Rejected input is
// intentionally not returned, logged or included in diagnostics.
export function correlationIdOf(req, uuid) {
  const presented = headerOf(req, 'x-correlation-id');
  if (typeof presented === 'string' && presented.length === 36 && UUID_RE.test(presented)) {
    return presented;
  }
  return uuid();
}

// RFC 9110 weak comparison for GET/HEAD validators. Our generated tags do not
// contain commas, so a comma-separated If-None-Match list is safe to split.
export function ifNoneMatchSatisfied(headerValue, etag) {
  if (typeof headerValue !== 'string' || headerValue.trim() === '') return false;
  const value = headerValue.trim();
  if (value === '*') return true;
  return value.split(',').some(candidate => candidate.trim().replace(/^W\//, '') === etag);
}
