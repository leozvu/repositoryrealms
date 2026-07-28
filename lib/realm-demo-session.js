const PRIVILEGED_ROLES = new Set([
  'DIRECTOR',
  'ADMIN',
  'ACCOUNTANT',
  'HR',
  'PM',
  'AM',
  'MANAGER',
  'LEAD',
]);

export const REALM_DEMO_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const REALM_DEMO_SESSION_DEFAULT_EMAIL = 'nhanvien@agency.vn';

export function realmDemoSessionPolicy(env = process.env) {
  const preview = env.VERCEL_ENV === 'preview';
  const explicitlyEnabled = env.REALMS_DEMO_SSO_ENABLED === '1';
  return {
    enabled: preview && explicitlyEnabled,
    preview,
    explicitlyEnabled,
    email: String(env.REALMS_DEMO_USER_EMAIL || REALM_DEMO_SESSION_DEFAULT_EMAIL).trim().toLowerCase(),
  };
}

export function realmDemoSessionRequestAllowed(request) {
  const requestOrigin = request?.nextUrl?.origin;
  const origin = request?.headers?.get?.('origin');
  const fetchSite = request?.headers?.get?.('sec-fetch-site');
  if (!requestOrigin) return false;
  if (origin && origin !== requestOrigin) return false;
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
  return true;
}

export function realmDemoSessionCandidate(user, roles = []) {
  if (!user || user.status !== 'active' || user.role !== 'STAFF') return false;
  if ((user.userType || 'employee') !== 'employee' || user.totpSecret) return false;
  if (user.accessUntil && user.accessUntil < new Date().toISOString().slice(0, 10)) return false;
  const normalizedRoles = Array.isArray(roles) ? roles.map((role) => String(role).toUpperCase()) : [];
  return normalizedRoles.length > 0
    && normalizedRoles.includes('STAFF')
    && normalizedRoles.every((role) => !PRIVILEGED_ROLES.has(role));
}

export function realmDemoSessionCookieName(secure) {
  return `${secure ? '__Secure-' : ''}next-auth.session-token`;
}

export function realmDemoSessionToken(user, roles) {
  return {
    sub: user.id,
    uid: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roles,
    teamId: user.teamId || null,
    userType: user.userType || 'employee',
    realmDemo: true,
  };
}
