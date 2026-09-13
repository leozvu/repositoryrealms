import { ERP_ALL_ROLES } from './erp-navigation.js';
import { realmPolicyDecision } from './realm-access.js';
import { REALM_V2_AREAS } from './realm-v2-contracts.js';

const AREA_POLICIES = Object.freeze({
  'my-work': { module: 'tasks' },
  'work-management': { roles: ['PM', 'LEAD'], module: 'tasks' },
  projects: { module: 'delivery' },
  // These screens load Director-only audit or CEO endpoints.
  chronicle: { roles: ['DIRECTOR'] },
  'command-center': { roles: ['DIRECTOR'] },
  'world-map': { roles: ['DIRECTOR'] },
  'ceo-terminal': { roles: ['DIRECTOR'] },
});

// The route and every menu use this same presentation policy. Existing API
// authorization remains authoritative, including record and team scoping.
export function realmV2AreaDecision(user, slug, modules = null) {
  if (!REALM_V2_AREAS.some((area) => area.slug === slug)) {
    return { allowed: false, code: 'unknown_area', reason: 'Khu vực này không tồn tại.' };
  }
  return realmPolicyDecision(user, {
    roles: ERP_ALL_ROLES,
    module: null,
    ...AREA_POLICIES[slug],
  }, modules);
}

export function visibleRealmV2Areas(user, modules = null) {
  return REALM_V2_AREAS.filter((area) => realmV2AreaDecision(user, area.slug, modules).allowed);
}
