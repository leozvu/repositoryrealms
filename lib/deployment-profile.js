export const DEPLOYMENT_KINDS = Object.freeze({
  ENTITY: 'entity',
  CEO_PORTAL: 'ceo-portal',
});

const CEO_PROJECT_HOSTS = new Set([
  'ceo-terminal-leoz.vercel.app',
]);

const CEO_PORTAL_UI_PREFIXES = Object.freeze([
  '/ceo-overview',
  '/ceo-world',
  '/ceo-commands',
  '/ceo-workforce',
  '/ceo-inbox',
  '/ceo-registry',
  '/ceo-security',
  '/ceo-rollout',
  '/realm-v2/command-center',
  '/realm-v2/world-map',
  '/realm-v2/ceo-terminal',
]);

// These are control-plane APIs. Entity deployments keep their target-side
// snapshot, capability, receipt, SSO callback and delivery endpoints available.
const CEO_PORTAL_API_PREFIXES = Object.freeze([
  '/api/ceo/v1/command-gateway',
  '/api/ceo/v1/dashboard',
  '/api/ceo/v1/federation/world',
  '/api/ceo/v1/identity',
  '/api/ceo/v1/messaging/conversations',
  '/api/ceo/v1/messaging/directory',
  '/api/ceo/v1/messaging/export',
  '/api/ceo/v1/messaging/messages',
  '/api/ceo/v1/registry',
  '/api/ceo/v1/rollout',
  '/api/ceo/v1/security',
  '/api/ceo/v1/sso/authorize',
  '/api/ceo/v1/sso/exchange',
  '/api/ceo/v1/staff',
]);

function normalizeDeploymentKind(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['ceo', 'ceo_portal', 'ceo-portal', 'portal', 'control-plane'].includes(normalized)) {
    return DEPLOYMENT_KINDS.CEO_PORTAL;
  }
  if (['entity', 'erp', 'company', 'target'].includes(normalized)) return DEPLOYMENT_KINDS.ENTITY;
  return null;
}

function hostnameOf(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function deploymentKind(env = process.env) {
  const explicit = normalizeDeploymentKind(
    env.REPOSITORYREALMS_DEPLOYMENT_KIND || env.APP_DEPLOYMENT_KIND,
  );
  if (explicit) return explicit;

  // VERCEL_PROJECT_PRODUCTION_URL is project-scoped, so a preview deployment is
  // still classified correctly without trusting the request Host header.
  const projectHost = hostnameOf(env.VERCEL_PROJECT_PRODUCTION_URL);
  const authHost = hostnameOf(env.NEXTAUTH_URL);
  if (CEO_PROJECT_HOSTS.has(projectHost) || CEO_PROJECT_HOSTS.has(authHost)) {
    return DEPLOYMENT_KINDS.CEO_PORTAL;
  }

  // Local CEO development remains opt-in. Production never relies on a public
  // feature flag for authorization or route exposure.
  if (env.NODE_ENV !== 'production' && env.NEXT_PUBLIC_CEO_GROUP_WORKFORCE === '1') {
    return DEPLOYMENT_KINDS.CEO_PORTAL;
  }
  return DEPLOYMENT_KINDS.ENTITY;
}

export function isCeoPortalDeployment(env = process.env) {
  return deploymentKind(env) === DEPLOYMENT_KINDS.CEO_PORTAL;
}

export function isCeoPortalOnlyPath(pathname) {
  const path = String(pathname || '').split('?')[0];
  return [...CEO_PORTAL_UI_PREFIXES, ...CEO_PORTAL_API_PREFIXES]
    .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function ceoPortalOrigin(env = process.env) {
  const configured = String(env.CEO_PORTAL_ORIGIN || '').trim();
  if (configured) {
    try { return new URL(configured).origin; } catch {}
  }
  if (isCeoPortalDeployment(env)) {
    const host = hostnameOf(env.VERCEL_PROJECT_PRODUCTION_URL) || hostnameOf(env.NEXTAUTH_URL);
    if (host) return `https://${host}`;
  }
  return 'https://ceo-terminal-leoz.vercel.app';
}

export function deploymentBranding(env = process.env) {
  if (isCeoPortalDeployment(env)) {
    return {
      kind: DEPLOYMENT_KINDS.CEO_PORTAL,
      company: 'Leoz Group',
      product: 'CEO Terminal',
      shortName: 'CEO Terminal',
      logoLetter: 'L',
      subtitle: 'Điều hành hợp nhất · 4 công ty',
      description: 'Trung tâm điều hành hợp nhất cho AIm Agency, Egoric Agency, Vnecom LLC và Egolive.',
      homePath: '/ceo-overview',
    };
  }
  return {
    kind: DEPLOYMENT_KINDS.ENTITY,
    company: 'CRMegoric',
    product: 'ERP · CRM',
    shortName: 'CRMegoric',
    logoLetter: 'C',
    subtitle: 'ERP · CRM · Realm đồng bộ',
    description: 'ERP và CRM đầy đủ với lớp trải nghiệm medieval, Realm, Quest, Gold và Tavern.',
    homePath: '/dashboard',
  };
}
