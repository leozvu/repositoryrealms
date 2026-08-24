export const DEPLOYMENT_KINDS = Object.freeze({
  ENTITY: 'entity',
  CEO_PORTAL: 'ceo-portal',
});

const CEO_PROJECT_HOSTS = new Set([
  'ceo-terminal-leoz.vercel.app',
]);

const ENTITY_DEPLOYMENTS = Object.freeze({
  aim: Object.freeze({
    id: 'aim',
    projectId: 'prj_gOCkd1N5rIovGeHZBtL8dJFepbGC',
    hosts: ['agency-erp-mu.vercel.app', 'agency-erp-leozs-projects-64a5f0c8.vercel.app'],
    company: 'AIm Agency',
    shortName: 'AIm',
    logoLetter: 'A',
    subtitle: 'Khách hàng · Dự án · Tài chính',
  }),
  egoric: Object.freeze({
    id: 'egoric',
    projectId: 'prj_Hh4aZEj9q3hvULaUfC4GwFvxYii9',
    hosts: ['erp-egoric.vercel.app', 'erp-egoric-leozs-projects-64a5f0c8.vercel.app'],
    company: 'Egoric Agency',
    shortName: 'Egoric',
    logoLetter: 'E',
    subtitle: 'Khách hàng · Dự án · Tài chính',
  }),
  vnecom: Object.freeze({
    id: 'vnecom',
    projectId: 'prj_Vaz8Su75zNPtjnX6M7ouR7aQ5Vrc',
    hosts: ['erp-vnecom.vercel.app', 'erp-vnecom-leozs-projects-64a5f0c8.vercel.app'],
    company: 'VNECOM LLC',
    shortName: 'VNECOM',
    logoLetter: 'V',
    subtitle: 'Vận hành · Công việc · Tài chính',
  }),
  egolive: Object.freeze({
    id: 'egolive',
    projectId: 'prj_ztSxMfO1MWDBQ758HgsMMPw4Ue4f',
    hosts: ['erp-egolive.vercel.app', 'erp-egolive-leozs-projects-64a5f0c8.vercel.app'],
    company: 'Egolive',
    shortName: 'Egolive',
    logoLetter: 'E',
    subtitle: 'Livestream · Đối soát · Vận hành',
  }),
});

const CEO_PORTAL_UI_PREFIXES = Object.freeze([
  '/ceo-overview',
  '/ceo-world',
  '/ceo-commands',
  '/ceo-workforce',
  '/ceo-inbox',
  '/ceo-registry',
  '/ceo-security',
  '/ceo-rollout',
  '/ceo-decisions',
  '/ceo-briefing',
  '/ceo-navigator',
  '/realm-v2/command-center',
  '/realm-v2/world-map',
  '/realm-v2/ceo-terminal',
]);

// These are control-plane APIs. Entity deployments keep their target-side
// snapshot, capability, receipt, SSO callback and delivery endpoints available.
const CEO_PORTAL_API_PREFIXES = Object.freeze([
  '/api/ceo/v1/command-gateway',
  '/api/ceo/v1/dashboard',
  '/api/ceo/v1/decision-queue',
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

export function deploymentEntity(env = process.env) {
  const explicitId = String(env.REPOSITORYREALMS_ENTITY_ID || env.APP_ENTITY_ID || '')
    .trim()
    .toLowerCase();
  if (ENTITY_DEPLOYMENTS[explicitId]) return ENTITY_DEPLOYMENTS[explicitId];

  const projectId = String(env.VERCEL_PROJECT_ID || '').trim();
  if (projectId) {
    const projectMatch = Object.values(ENTITY_DEPLOYMENTS)
      .find((entity) => entity.projectId === projectId);
    if (projectMatch) return projectMatch;
  }

  const hosts = [
    hostnameOf(env.VERCEL_PROJECT_PRODUCTION_URL),
    hostnameOf(env.NEXTAUTH_URL),
  ].filter(Boolean);
  return Object.values(ENTITY_DEPLOYMENTS)
    .find((entity) => hosts.some((host) => entity.hosts.includes(host))) || null;
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
  const entity = deploymentEntity(env);
  if (entity) {
    return {
      kind: DEPLOYMENT_KINDS.ENTITY,
      entityId: entity.id,
      company: entity.company,
      product: 'Business Workspace',
      shortName: entity.shortName,
      logoLetter: entity.logoLetter,
      subtitle: entity.subtitle,
      description: `Không gian điều hành công việc, khách hàng và tài chính của ${entity.company}.`,
      homePath: '/dashboard',
    };
  }
  return {
    kind: DEPLOYMENT_KINDS.ENTITY,
    company: 'CRMegoric',
    product: 'Business Workspace',
    shortName: 'CRMegoric',
    logoLetter: 'C',
    subtitle: 'Khách hàng · Công việc · Tài chính',
    description: 'Không gian điều hành công việc, khách hàng và tài chính trong một hệ thống thống nhất.',
    homePath: '/dashboard',
  };
}
