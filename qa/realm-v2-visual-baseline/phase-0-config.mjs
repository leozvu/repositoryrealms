export const PHASE_0_BREAKPOINTS = Object.freeze([
  { id: 'phone-375', width: 375, height: 812 },
  { id: 'phone-390', width: 390, height: 844 },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'laptop-1024', width: 1024, height: 768 },
  { id: 'desktop-1440', width: 1440, height: 900 },
]);

export const PHASE_0_SCORE_WEIGHTS = Object.freeze({
  layoutHierarchy: 25,
  componentFidelity: 20,
  tokenFidelity: 15,
  responsiveComposition: 15,
  interactionResilience: 10,
  accessibility: 10,
  localizationPerformance: 5,
});

const canonicalTheme = 'Partial — canonical workflow with Realm v2 token skin';

export const PHASE_0_AREAS = Object.freeze([
  {
    slug: 'home', productArea: 'Realm Home', board: '06-realm-home-my-work-v1.png', canonicalPath: '/dashboard',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical ERP route', visualScore: 50, responsiveScore: 40,
    dimensions: { layoutHierarchy: 52, componentFidelity: 45, tokenFidelity: 62, responsiveComposition: 40, interactionResilience: 48, accessibility: 58, localizationPerformance: 62 },
  },
  {
    slug: 'my-work', productArea: 'My Work', board: '06-realm-home-my-work-v1.png', canonicalPath: '/myday',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical ERP route', visualScore: 45, responsiveScore: 38,
    dimensions: { layoutHierarchy: 48, componentFidelity: 40, tokenFidelity: 58, responsiveComposition: 38, interactionResilience: 45, accessibility: 55, localizationPerformance: 60 },
  },
  {
    slug: 'work-management', productArea: 'Work Management', board: '07-work-management-action-center-v1.png', canonicalPath: '/tasks',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical ERP route', visualScore: 40, responsiveScore: 32,
    dimensions: { layoutHierarchy: 42, componentFidelity: 35, tokenFidelity: 55, responsiveComposition: 32, interactionResilience: 42, accessibility: 52, localizationPerformance: 58 },
  },
  {
    slug: 'action-center', productArea: 'Action Center', board: '07-work-management-action-center-v1.png', canonicalPath: '/approvals',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical authorization and receipts', visualScore: 55, responsiveScore: 45,
    dimensions: { layoutHierarchy: 58, componentFidelity: 50, tokenFidelity: 64, responsiveComposition: 45, interactionResilience: 56, accessibility: 62, localizationPerformance: 62 },
  },
  {
    slug: 'command-center', productArea: 'Command Center', board: '08-command-center-approvals-v1.png', canonicalPath: '/ceo-commands',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical command gateway', visualScore: 45, responsiveScore: 35,
    dimensions: { layoutHierarchy: 47, componentFidelity: 40, tokenFidelity: 60, responsiveComposition: 35, interactionResilience: 52, accessibility: 58, localizationPerformance: 58 },
  },
  {
    slug: 'inbox', productArea: 'Unified Inbox', board: '09-unified-inbox-collaboration-v1.png', canonicalPath: '/messages',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical messaging route', visualScore: 45, responsiveScore: 38,
    dimensions: { layoutHierarchy: 46, componentFidelity: 38, tokenFidelity: 58, responsiveComposition: 38, interactionResilience: 45, accessibility: 54, localizationPerformance: 58 },
  },
  {
    slug: 'projects', productArea: 'Project Realm', board: '10-project-realm-chronicle-v1.png', canonicalPath: '/projects',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical project route', visualScore: 40, responsiveScore: 32,
    dimensions: { layoutHierarchy: 43, componentFidelity: 34, tokenFidelity: 55, responsiveComposition: 32, interactionResilience: 40, accessibility: 50, localizationPerformance: 55 },
  },
  {
    slug: 'chronicle', productArea: 'Chronicle', board: '10-project-realm-chronicle-v1.png', canonicalPath: '/realm',
    implementation: 'Partial — existing Realm ledger, reference composition absent', canonicalData: 'Yes — canonical Realm journal', visualScore: 25, responsiveScore: 20,
    dimensions: { layoutHierarchy: 28, componentFidelity: 20, tokenFidelity: 50, responsiveComposition: 20, interactionResilience: 32, accessibility: 45, localizationPerformance: 52 },
  },
  {
    slug: 'collaboration', productArea: 'Collaboration / Presence', board: '09-unified-inbox-collaboration-v1.png', canonicalPath: '/teamwork',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical collaboration route', visualScore: 30, responsiveScore: 25,
    dimensions: { layoutHierarchy: 34, componentFidelity: 25, tokenFidelity: 52, responsiveComposition: 25, interactionResilience: 34, accessibility: 47, localizationPerformance: 55 },
  },
  {
    slug: 'world-map', productArea: 'World Map', board: '11-world-map-ceo-terminal-v1.png', canonicalPath: '/ceo-world',
    implementation: 'Partial — canonical federation map with legacy composition', canonicalData: 'Yes — canonical entity federation', visualScore: 65, responsiveScore: 55,
    dimensions: { layoutHierarchy: 68, componentFidelity: 60, tokenFidelity: 70, responsiveComposition: 55, interactionResilience: 58, accessibility: 62, localizationPerformance: 62 },
  },
  {
    slug: 'ceo-terminal', productArea: 'CEO Terminal', board: '11-world-map-ceo-terminal-v1.png', canonicalPath: '/ceo-overview',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical CEO aggregation', visualScore: 55, responsiveScore: 40,
    dimensions: { layoutHierarchy: 56, componentFidelity: 48, tokenFidelity: 65, responsiveComposition: 40, interactionResilience: 52, accessibility: 58, localizationPerformance: 58 },
  },
  {
    slug: 'employee-profile', productArea: 'Employee Profile', board: '12-employee-profile-recognition-v1.png', canonicalPath: '/staff',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical staff route', visualScore: 35, responsiveScore: 28,
    dimensions: { layoutHierarchy: 38, componentFidelity: 30, tokenFidelity: 55, responsiveComposition: 28, interactionResilience: 36, accessibility: 50, localizationPerformance: 55 },
  },
  {
    slug: 'recognition', productArea: 'Recognition / Gold Ledger', board: '12-employee-profile-recognition-v1.png', canonicalPath: '/realm',
    implementation: 'Partial — canonical Realm ledger, reference composition absent', canonicalData: 'Yes — canonical Gold journal', visualScore: 55, responsiveScore: 45,
    dimensions: { layoutHierarchy: 58, componentFidelity: 50, tokenFidelity: 65, responsiveComposition: 45, interactionResilience: 55, accessibility: 60, localizationPerformance: 60 },
  },
  {
    slug: 'approvals', productArea: 'Approvals', board: '08-command-center-approvals-v1.png', canonicalPath: '/approvals',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical authorization and receipts', visualScore: 60, responsiveScore: 50,
    dimensions: { layoutHierarchy: 62, componentFidelity: 55, tokenFidelity: 68, responsiveComposition: 50, interactionResilience: 62, accessibility: 65, localizationPerformance: 65 },
  },
  {
    slug: 'notifications', productArea: 'Notifications', board: '13-settings-search-notifications-v1.png', canonicalPath: '/dashboard',
    implementation: 'Partial — canonical dashboard opens, notification overlay is not deep-linked', canonicalData: 'Yes — scenario entry incomplete', visualScore: 45, responsiveScore: 35,
    dimensions: { layoutHierarchy: 46, componentFidelity: 38, tokenFidelity: 58, responsiveComposition: 35, interactionResilience: 42, accessibility: 55, localizationPerformance: 58 },
  },
  {
    slug: 'search', productArea: 'Search / Command Palette', board: '13-settings-search-notifications-v1.png', canonicalPath: '/dashboard',
    implementation: 'Partial — canonical dashboard opens, command palette is not deep-linked', canonicalData: 'Yes — scenario entry incomplete', visualScore: 45, responsiveScore: 35,
    dimensions: { layoutHierarchy: 48, componentFidelity: 40, tokenFidelity: 58, responsiveComposition: 35, interactionResilience: 45, accessibility: 58, localizationPerformance: 58 },
  },
  {
    slug: 'settings', productArea: 'Settings', board: '13-settings-search-notifications-v1.png', canonicalPath: '/settings',
    implementation: canonicalTheme, canonicalData: 'Yes — canonical settings route', visualScore: 50, responsiveScore: 45,
    dimensions: { layoutHierarchy: 52, componentFidelity: 45, tokenFidelity: 62, responsiveComposition: 45, interactionResilience: 48, accessibility: 60, localizationPerformance: 60 },
  },
  {
    slug: 'mobile', productArea: 'Mobile Realm', board: '14-mobile-realm-v1.png', canonicalPath: '/dashboard',
    implementation: 'Partial — responsive ERP dashboard, priority-first Realm shell absent', canonicalData: 'Yes — canonical dashboard route', visualScore: 35, responsiveScore: 25,
    dimensions: { layoutHierarchy: 38, componentFidelity: 30, tokenFidelity: 52, responsiveComposition: 25, interactionResilience: 35, accessibility: 48, localizationPerformance: 55 },
  },
]);

export function weightedAreaScore(area) {
  return Number((Object.entries(PHASE_0_SCORE_WEIGHTS).reduce(
    (sum, [dimension, weight]) => sum + (area.dimensions[dimension] * weight / 100),
    0,
  )).toFixed(1));
}

export function aggregatePhaseScore(areas = PHASE_0_AREAS) {
  return Number((areas.reduce((sum, area) => sum + weightedAreaScore(area), 0) / areas.length).toFixed(1));
}
