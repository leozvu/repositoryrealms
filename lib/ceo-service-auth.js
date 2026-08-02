import crypto from 'crypto';
import { hashKey } from './apiauth.js';
import { prisma } from './prisma.js';
import { loadCeoCapabilities } from './ceo-entity-admin.js';

export const CEO_SERVICE_SCOPES = Object.freeze({
  CAPABILITIES_READ: 'ceo.capabilities.read',
  HEALTH_READ: 'ceo.health.read',
  SNAPSHOT_READ: 'ceo.snapshot.read',
  DECISIONS_READ: 'ceo.decisions.read',
  COMMAND_DISPATCH: 'ceo.command.dispatch',
  COMMAND_RECEIPTS_READ: 'ceo.command.receipts.read',
  DIRECTORY_READ: 'ceo.directory.read',
  MESSAGE_DELIVER: 'ceo.message.deliver',
  MESSAGE_RECEIPTS_READ: 'ceo.message.receipts.read',
  MESSAGE_FEED_READ: 'ceo.message.feed.read',
  FEDERATION_READ: 'realm.federation.read',
  // v3.40: công ty xin mã SSO cho NHÂN SỰ của mình sang công ty khác trong group (Đợt 3b)
  STAFF_SSO: 'ceo.staff.sso',
  // v3.40: công ty chuyển tiếp tin nhắn liên công ty do NHÂN SỰ gửi (Đợt 3c)
  STAFF_MESSAGE: 'ceo.staff.message',
});

export const CEO_SERVICE_SCOPE_ALLOWLIST = Object.freeze(Object.values(CEO_SERVICE_SCOPES));

export const CEO_SERVICE_RATE_LIMITS = Object.freeze({
  [CEO_SERVICE_SCOPES.COMMAND_DISPATCH]: 30,
  [CEO_SERVICE_SCOPES.MESSAGE_DELIVER]: 60,
  [CEO_SERVICE_SCOPES.SNAPSHOT_READ]: 90,
  [CEO_SERVICE_SCOPES.DECISIONS_READ]: 90,
  [CEO_SERVICE_SCOPES.MESSAGE_FEED_READ]: 90,
  [CEO_SERVICE_SCOPES.FEDERATION_READ]: 90,
  default: 120,
});

const WINDOW_MS = 60_000;

export class CeoServiceAuthError extends Error {
  constructor(message, status = 401, code = 'ceo_service_unauthorized', headers = {}) {
    super(message);
    this.name = 'CeoServiceAuthError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function parseBearer(request) {
  const header = request?.headers?.get?.('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export function parseCeoServiceScopes(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((scope) => String(scope || '').trim()).filter((scope) => CEO_SERVICE_SCOPE_ALLOWLIST.includes(scope)))];
  } catch {
    return [];
  }
}

export function normalizeCeoServiceAudience(value) {
  const audience = String(value || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(audience)) {
    throw new CeoServiceAuthError('A valid entity audience is required.', 403, 'ceo_service_audience_required');
  }
  return audience;
}

function rolesOfKey(key) {
  try {
    const parsed = JSON.parse(key.roles || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function bucketIdentity(apiKeyId, audience, scope, windowStartedAt) {
  return crypto.createHash('sha256').update(`${apiKeyId}:${audience}:${scope}:${windowStartedAt.toISOString()}`).digest('hex');
}

async function consumeRateLimit(db, key, audience, scope, now, limit) {
  const windowStartedAt = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
  const expiresAt = new Date(windowStartedAt.getTime() + (WINDOW_MS * 2));
  const bucketKey = bucketIdentity(key.id, audience, scope, windowStartedAt);
  const bucket = await db.ceoApiRateLimitBucket.upsert({
    where: { bucketKey },
    create: { bucketKey, apiKeyId: key.id, audience, scope, windowStartedAt, expiresAt, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });
  const resetSeconds = Math.max(1, Math.ceil((windowStartedAt.getTime() + WINDOW_MS - now.getTime()) / 1000));
  if (bucket.requestCount > limit) {
    throw new CeoServiceAuthError('Entity service rate limit exceeded.', 429, 'ceo_service_rate_limited', {
      'Retry-After': String(resetSeconds),
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': '0',
    });
  }
  db.ceoApiRateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, limit - bucket.requestCount)),
    'X-RateLimit-Reset': String(resetSeconds),
  };
}

export async function authenticateCeoServiceRequest(db, request, requiredScope, {
  now = new Date(),
  rateLimit = CEO_SERVICE_RATE_LIMITS[requiredScope] || CEO_SERVICE_RATE_LIMITS.default,
  consume = true,
  expectedAudience = null,
} = {}) {
  if (!CEO_SERVICE_SCOPE_ALLOWLIST.includes(requiredScope)) {
    throw new CeoServiceAuthError('Service scope is not supported.', 500, 'ceo_service_scope_configuration_invalid');
  }
  const raw = parseBearer(request);
  if (!raw) throw new CeoServiceAuthError('Service credential is required.', 401, 'ceo_service_credential_required');
  const key = await db.apiKey.findUnique({ where: { keyHash: hashKey(raw) } });
  if (!key || !key.active) throw new CeoServiceAuthError('Service credential is invalid.', 401, 'ceo_service_credential_invalid');
  if (key.expiresAt && new Date(key.expiresAt) <= now) {
    throw new CeoServiceAuthError('Service credential has expired.', 401, 'ceo_service_credential_expired');
  }
  const scopes = parseCeoServiceScopes(key.scopes);
  if (!scopes.includes(requiredScope)) {
    throw new CeoServiceAuthError('Service credential lacks the required scope.', 403, 'ceo_service_scope_required');
  }
  const audience = normalizeCeoServiceAudience(request?.headers?.get?.('x-ceo-entity-id'));
  if (!key.audience || key.audience !== audience) {
    throw new CeoServiceAuthError('Service credential audience does not match this entity.', 403, 'ceo_service_audience_mismatch');
  }
  if (expectedAudience && audience !== normalizeCeoServiceAudience(expectedAudience)) {
    throw new CeoServiceAuthError('Service request was sent to the wrong entity.', 403, 'ceo_service_target_audience_mismatch');
  }
  const roles = rolesOfKey(key);
  if (!roles.includes('DIRECTOR')) {
    throw new CeoServiceAuthError('Director service role is required.', 403, 'ceo_service_director_required');
  }
  const rateHeaders = consume ? await consumeRateLimit(db, key, audience, requiredScope, now, rateLimit) : {};
  db.apiKey.update({ where: { id: key.id }, data: { lastUsed: now } }).catch(() => {});
  return {
    user: { id: `apikey:${key.id}`, name: `CEO service ${key.name}`, roles, teamId: null },
    credential: { id: key.id, prefix: key.prefix, audience, scopes, expiresAt: key.expiresAt || null },
    headers: rateHeaders,
  };
}

export async function requireCeoService(request, scope, options = {}) {
  // Preserve a cheap, deterministic 401 boundary for anonymous callers even when
  // the target database is unavailable. Entity resolution happens only after a
  // Bearer credential is present.
  if (!parseBearer(request)) return authenticateCeoServiceRequest(prisma, request, scope, options);
  const expectedAudience = options.expectedAudience || (await loadCeoCapabilities(prisma)).entity.id;
  return authenticateCeoServiceRequest(prisma, request, scope, { ...options, expectedAudience });
}

export function ceoServiceAuthError(error) {
  const known = error instanceof CeoServiceAuthError;
  return {
    status: known ? error.status : 503,
    body: {
      error: known ? error.message : 'CEO service authentication is unavailable.',
      code: known ? error.code : 'ceo_service_auth_unavailable',
    },
    headers: known ? error.headers : {},
  };
}
