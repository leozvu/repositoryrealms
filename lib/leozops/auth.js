// Sprint 1A — T2: LEOZOPS_READ bearer-key verification.
//
// This credential is SCOPED to the snapshot route only. It deliberately does NOT
// touch next-auth, does NOT create a session, and does NOT go through apiUser()
// / the apiKey DB table — so it can never satisfy the app's normal auth.
//
// Verification = constant-time compare of sha256(presented key) against the env
// hash LEOZOPS_READ_KEY_HASH. No key material is stored in the DB. The raw key is
// NEVER logged; only a short fingerprint (first 8 hex of the expected hash) may be.

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

// Returns { ok, fingerprint }. ok=false whenever the env hash is absent/malformed
// or the presented key is missing/malformed/wrong — i.e. nothing validates by
// default (feature disabled unless the hash is deployed).
export function verifyReadKey(req, env) {
  const expected = env && env.LEOZOPS_READ_KEY_HASH;
  const fingerprint = readKeyFingerprint(expected);
  // No configured hash -> nothing can validate.
  if (!fingerprint) return { ok: false, fingerprint: null };

  const raw = bearerToken(req);
  if (!raw) return { ok: false, fingerprint };

  const presented = Buffer.from(sha256hex(raw), 'hex');
  const good = Buffer.from(expected, 'hex');
  // Lengths are equal (both sha256), but guard anyway before timingSafeEqual.
  const ok = presented.length === good.length && crypto.timingSafeEqual(presented, good);
  return { ok, fingerprint };
}
