// LeozOps route-scoped bearer-key verification.
//
// Credentials deliberately do NOT touch next-auth, create sessions or go through
// apiUser()/the apiKey DB table. Each route supplies its own expected env hash,
// so adding a route never silently expands the scope of an existing key.
//
// Verification = constant-time compare of sha256(presented key) against the env
// No key material is stored in the DB. The raw key is NEVER logged; only a short
// fingerprint (first 8 hex of the expected hash) may be.

import crypto from 'crypto';

export const sha256hex = raw => crypto.createHash('sha256').update(raw).digest('hex');

// Short, non-reversible fingerprint for audit logs. Derived from the EXPECTED
// hash (env), never from the presented key.
export const readKeyFingerprint = hashHex =>
  (typeof hashHex === 'string' && /^[0-9a-f]{64}$/i.test(hashHex)) ? hashHex.slice(0, 8) : null;

function bearerToken(req) {
  const auth = (req.headers.get && req.headers.get('authorization')) || '';
  if (!auth.startsWith('Bearer ')) return null;
  const raw = auth.slice(7).trim();
  return raw.length ? raw : null;
}

// Verify a bearer token against one explicitly supplied sha256 hash. Route
// adapters choose the hash, which keeps credentials least-privileged instead
// of silently expanding the original snapshot key to new surfaces.
export function verifyBearerHash(req, expected) {
  const fingerprint = readKeyFingerprint(expected);
  if (!fingerprint) return { ok: false, fingerprint: null };

  const raw = bearerToken(req);
  if (!raw) return { ok: false, fingerprint };

  const presented = Buffer.from(sha256hex(raw), 'hex');
  const good = Buffer.from(expected, 'hex');
  const ok = presented.length === good.length && crypto.timingSafeEqual(presented, good);
  return { ok, fingerprint };
}

// Returns { ok, fingerprint }. ok=false whenever the env hash is absent/malformed
// or the presented key is missing/malformed/wrong — i.e. nothing validates by
// default (feature disabled unless the hash is deployed).
export function verifyReadKey(req, env) {
  const expected = env && env.LEOZOPS_READ_KEY_HASH;
  return verifyBearerHash(req, expected);
}
