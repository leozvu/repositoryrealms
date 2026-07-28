import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 1;
const REQUIRED_FIELDS = ['sub', 'realmId', 'mapId', 'name'];

function sign(body, secret) {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function safeText(value, maxLength = 80) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function assertSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 24) {
    throw new Error('REALM_SIGNAL_SECRET must contain at least 24 characters');
  }
}

export function issueRealmToken(claims, secret, options = {}) {
  assertSecret(secret);
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const ttlSeconds = Math.max(30, Math.min(Number(options.ttlSeconds) || 300, 900));
  const payload = {
    v: TOKEN_VERSION,
    sub: safeText(claims.sub, 96),
    realmId: safeText(claims.realmId, 64),
    mapId: safeText(claims.mapId, 64),
    name: safeText(claims.name, 40),
    ...(claims.userId ? { userId: safeText(claims.userId, 96) } : {}),
    iat: now,
    exp: now + ttlSeconds,
  };

  if (REQUIRED_FIELDS.some((field) => !payload[field])) throw new Error('Missing required realm token claim');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyRealmToken(token, secret, options = {}) {
  assertSecret(secret);
  if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid realm token');
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) throw new Error('Invalid realm token');

  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error('Invalid realm token signature');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid realm token payload');
  }

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const clockSkew = Math.max(0, Math.min(Number(options.clockSkewSeconds) || 5, 30));
  if (payload.v !== TOKEN_VERSION || REQUIRED_FIELDS.some((field) => !safeText(payload[field]))) {
    throw new Error('Invalid realm token claims');
  }
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) throw new Error('Invalid realm token time');
  if (payload.exp < now - clockSkew) throw new Error('Realm token expired');
  if (payload.iat > now + clockSkew) throw new Error('Realm token not active');
  return payload;
}

export function realmRoomKey(claims) {
  return `${safeText(claims.realmId, 64)}:${safeText(claims.mapId, 64)}`;
}
