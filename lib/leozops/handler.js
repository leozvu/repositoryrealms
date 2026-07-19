// Sprint 1A — T3: feature-flagged, GET-only snapshot handler (transport-agnostic).
//
// Pure-ish core so it can be unit-tested without Next/Prisma: returns a plain
// { status, headers, body } that the route adapter turns into a Response.
//
// Safety gates, in order:
//   1. LEOZOPS_SNAPSHOT_ENABLED !== 'true'  -> 404 (route is effectively absent)
//   2. method !== GET                        -> 405
//   3. bad/missing bearer key                -> 401
//   4. valid key                             -> 200 with the T1 snapshot payload
//
// The lead data is supplied by an injected loadLeads() so the same DB the
// deployment owns is queried read-only (each business has its own DB — tenant
// isolation is inherent, no cross-tenant query is ever issued).

import { buildSnapshot } from './projector.js';
import { verifyReadKey } from './auth.js';

export async function handleSnapshot(req, opts = {}) {
  const {
    env = {},
    loadLeads,
    now = () => Date.now(),
  } = opts;

  // 1. Feature flag — off/absent => 404, no key even gets a chance to validate.
  if (env.LEOZOPS_SNAPSHOT_ENABLED !== 'true') {
    return { status: 404, headers: {}, body: { error: 'not found' } };
  }

  // 2. GET only.
  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    return { status: 405, headers: { Allow: 'GET' }, body: { error: 'method not allowed' } };
  }

  // 3. Bearer key.
  const { ok } = verifyReadKey(req, env);
  if (!ok) {
    return { status: 401, headers: {}, body: { error: 'unauthorized' } };
  }

  // 4. Read-only data pull + de-identified projection.
  const rawLeads = await loadLeads();
  const generatedAt = new Date(now()).toISOString();
  const snapshot = buildSnapshot(rawLeads, { generatedAt });

  return { status: 200, headers: {}, body: snapshot };
}
