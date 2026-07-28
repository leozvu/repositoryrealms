import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CEO_COMMAND_DEFINITIONS } from './ceo-command-gateway.js';
import { CEO_MESSAGING_SCOPES } from './ceo-messaging.js';
import { CEO_FEDERATION_SCOPE } from './ceo-federation.js';

export const CEO_IDENTITY_VERSION = 1;
export const CEO_PORTAL_SESSION_TTL_MS = 8 * 60 * 60_000;
export const CEO_PORTAL_IDLE_TTL_MS = 30 * 60_000;
// Đợt 1 (chỉ đạo founder 24/7): 10' → 60'. Với CEO dùng một mình + phiên 8h + idle 30',
// step-up 10 phút bắt nhập TOTP lặp lại mỗi lần giao việc — ma sát lớn nhất khi vận hành.
export const CEO_STEP_UP_TTL_MS = 60 * 60_000;
export const CEO_SSO_CODE_TTL_MS = 45_000;
export const CEO_SSO_ASSERTION_TTL_MS = 30_000;
export const CEO_RECOVERY_CODE_COUNT = 10;
export const CEO_PORTAL_SESSION_COOKIE = 'repositoryrealms.ceo-session';
export const CEO_SSO_SCOPES = Object.freeze([
  'entity.open',
  'finance.read',
  'crm.read',
  'delivery.read',
  'support.read',
  'people.read',
  'export.read',
  'inventory.read',
  'livestream.read',
  ...CEO_COMMAND_DEFINITIONS.map((command) => command.scope),
  ...CEO_MESSAGING_SCOPES,
  CEO_FEDERATION_SCOPE,
]);

export class CeoIdentityError extends Error {
  constructor(message, status = 400, code = 'ceo_identity_invalid') {
    super(message);
    this.name = 'CeoIdentityError';
    this.status = status;
    this.code = code;
  }
}

function requireHashSecret(secret) {
  const value = String(secret || '');
  if (value.length < 32) {
    throw new CeoIdentityError('CEO identity hash secret is unavailable.', 503, 'ceo_identity_secret_unavailable');
  }
  return value;
}

function requireEntitySecret(secret) {
  const value = String(secret || '');
  if (value.length < 24) {
    throw new CeoIdentityError('Entity SSO credential is unavailable.', 503, 'ceo_sso_entity_secret_unavailable');
  }
  return value;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function ceoIdentityHashSecret(env = process.env) {
  return requireHashSecret(env.CEO_SSO_HASH_SECRET || env.NEXTAUTH_SECRET || env.AUTH_SECRET);
}

export function hashCeoIdentitySecret(value, secret) {
  return createHmac('sha256', requireHashSecret(secret)).update(String(value || '')).digest('hex');
}

export function hashCeoIdentityMetadata(value) {
  const normalized = String(value || '').trim().slice(0, 512);
  return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
}

export function newCeoOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function newCeoSubject() {
  return `ceo_${newCeoOpaqueToken(18)}`;
}

export function newCeoRecoveryCode() {
  const raw = randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12).padEnd(12, 'X');
  return `RR-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function normalizeCeoDeviceLabel(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return normalized || 'CEO browser';
}

export function normalizeCeoEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CeoIdentityError('Email is invalid.', 400, 'ceo_identity_email_invalid');
  }
  return email;
}

export function normalizeCeoSsoArtifact(value, field = 'artifact') {
  const normalized = String(value || '').trim();
  if (normalized.length < 20 || normalized.length > 180 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new CeoIdentityError(`${field} is invalid.`, 400, `ceo_sso_${field}_invalid`);
  }
  return normalized;
}

export function normalizeCeoRedirectPath(value) {
  const path = String(value || '/dashboard').trim();
  if (
    path.length > 512 || !path.startsWith('/') || path.startsWith('//')
    || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new CeoIdentityError('Redirect path must be an internal path.', 400, 'ceo_sso_redirect_invalid');
  }
  let parsed;
  try {
    parsed = new URL(path, 'https://repositoryrealms.invalid');
  } catch {
    throw new CeoIdentityError('Redirect path is invalid.', 400, 'ceo_sso_redirect_invalid');
  }
  if (parsed.origin !== 'https://repositoryrealms.invalid' || parsed.pathname.startsWith('/api/ceo/v1/sso/')) {
    throw new CeoIdentityError('Redirect path is not allowed.', 400, 'ceo_sso_redirect_invalid');
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function normalizeCeoScopes(value) {
  const values = Array.isArray(value) ? value : (() => { try { return JSON.parse(value || '[]'); } catch { return []; } })();
  const requested = new Set(values.map((scope) => String(scope || '').trim().toLowerCase()));
  return CEO_SSO_SCOPES.filter((scope) => requested.has(scope));
}

export function capabilitiesToCeoScopes(capabilities) {
  const enabled = new Set(capabilities || []);
  return [
    'entity.open',
    ...([...enabled].map((domain) => `${domain}.read`)),
    ...CEO_COMMAND_DEFINITIONS.filter((command) => enabled.has(command.capability)).map((command) => command.scope),
    ...(enabled.has('people') ? CEO_MESSAGING_SCOPES : []),
    ...(enabled.has('people') ? [CEO_FEDERATION_SCOPE] : []),
  ]
    .filter((scope) => CEO_SSO_SCOPES.includes(scope));
}

export function ceoPortalSessionCookieName(secure) {
  return `${secure ? '__Secure-' : ''}${CEO_PORTAL_SESSION_COOKIE}`;
}

export function ceoPortalSessionState(row, now = new Date()) {
  if (!row || row.identity?.status !== 'active') return { active: false, code: 'ceo_identity_inactive' };
  if (row.revokedAt) return { active: false, code: 'ceo_session_revoked' };
  if (new Date(row.expiresAt) <= now) return { active: false, code: 'ceo_session_expired' };
  if (new Date(row.idleExpiresAt) <= now) return { active: false, code: 'ceo_session_idle_expired' };
  return {
    active: true,
    code: null,
    stepUp: Boolean(row.stepUpAt && now.getTime() - new Date(row.stepUpAt).getTime() <= CEO_STEP_UP_TTL_MS),
  };
}

export function serializeCeoPortalSession(row, now = new Date()) {
  const state = ceoPortalSessionState(row, now);
  return {
    id: row.id,
    deviceLabel: row.deviceLabel,
    assuranceLevel: row.assuranceLevel,
    stepUp: state.active && state.stepUp,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt || null,
    current: Boolean(row.current),
  };
}

export function requireCeoStepUp(session, now = new Date()) {
  const state = ceoPortalSessionState(session, now);
  if (!state.active) throw new CeoIdentityError('CEO session is not active.', 401, state.code);
  if (!state.stepUp) {
    throw new CeoIdentityError('Recent TOTP verification is required.', 428, 'ceo_step_up_required');
  }
  return state;
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

export function createCeoEntityAssertion({ payload, entitySecret }) {
  const secret = requireEntitySecret(entitySecret);
  const encoded = encode(JSON.stringify({ v: CEO_IDENTITY_VERSION, ...payload }));
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyCeoEntityAssertion({ assertion, entityId, entitySecret, now = new Date() }) {
  const secret = requireEntitySecret(entitySecret);
  const [encoded, signature, ...extra] = String(assertion || '').split('.');
  if (!encoded || !signature || extra.length) {
    throw new CeoIdentityError('SSO assertion is invalid.', 401, 'ceo_sso_assertion_invalid');
  }
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!safeEqual(expected, signature)) {
    throw new CeoIdentityError('SSO assertion signature is invalid.', 401, 'ceo_sso_assertion_invalid');
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch {
    throw new CeoIdentityError('SSO assertion payload is invalid.', 401, 'ceo_sso_assertion_invalid');
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.v !== CEO_IDENTITY_VERSION || payload.aud !== entityId || payload.exp <= nowSeconds || payload.iat > nowSeconds + 5) {
    throw new CeoIdentityError('SSO assertion audience or lifetime is invalid.', 401, 'ceo_sso_assertion_claims_invalid');
  }
  if (!payload.sub || !payload.nonce || payload.role !== 'DIRECTOR') {
    throw new CeoIdentityError('SSO assertion claims are incomplete.', 401, 'ceo_sso_assertion_claims_invalid');
  }
  return { ...payload, scopes: normalizeCeoScopes(payload.scopes), redirectPath: normalizeCeoRedirectPath(payload.redirectPath) };
}

export function ceoEntityCredentialMatches(provided, expected) {
  const left = String(provided || '');
  const right = String(expected || '');
  return left.length >= 24 && right.length >= 24 && safeEqual(left, right);
}

export function ceoRequestIsSameOrigin(request) {
  const requestOrigin = request?.nextUrl?.origin;
  const origin = request?.headers?.get?.('origin');
  const fetchSite = request?.headers?.get?.('sec-fetch-site');
  if (!requestOrigin) return false;
  if (origin && origin !== requestOrigin) return false;
  return !fetchSite || ['same-origin', 'none'].includes(fetchSite);
}

export function normalizeCeoPortalOrigin(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); } catch {
    throw new CeoIdentityError('CEO Portal origin is invalid.', 503, 'ceo_portal_origin_invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new CeoIdentityError('CEO Portal origin must be an HTTPS origin.', 503, 'ceo_portal_origin_invalid');
  }
  return parsed.origin;
}
