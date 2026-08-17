export const REALM_VISUAL_FORGE_VERSION = '1.0.0';

export const REALM_VISUAL_ASSETS = Object.freeze([
  Object.freeze({
    id: 'character-lineup',
    kind: 'concept',
    role: 'character-anchor',
    path: 'public/realms/assets/visual-forge/v1/concepts/realm-character-lineup-v1.png',
    runtime: false,
  }),
  Object.freeze({
    id: 'guildhall-keyframe',
    kind: 'concept',
    role: 'environment-anchor',
    path: 'public/realms/assets/visual-forge/v1/concepts/realm-guildhall-keyframe-v1.png',
    runtime: false,
  }),
  Object.freeze({
    id: 'guildhall-architecture-shell',
    kind: 'layer-candidate',
    role: 'background-architecture',
    path: 'public/realms/assets/visual-forge/v1/layers/guildhall-architecture-shell-v1.png',
    alphaRequired: true,
    runtime: false,
  }),
  Object.freeze({
    id: 'guildhall-walkable-floor',
    kind: 'layer-candidate',
    role: 'walkable-floor',
    path: 'public/realms/assets/visual-forge/v1/layers/guildhall-walkable-floor-v1.png',
    alphaRequired: true,
    runtime: false,
  }),
  Object.freeze({
    id: 'guildhall-clean-base-plate',
    kind: 'registration-candidate',
    role: 'registration-master',
    path: 'public/realms/assets/visual-forge/v1/layers/guildhall-clean-base-plate-v1.png',
    runtime: false,
  }),
  Object.freeze({
    id: 'guildhall-business-landmarks',
    kind: 'atlas-candidate',
    role: 'interactive-props',
    path: 'public/realms/assets/visual-forge/v1/atlases/guildhall-business-landmarks-v1.png',
    alphaRequired: true,
    runtime: false,
  }),
  Object.freeze({
    id: 'guildhall-foreground-occluders',
    kind: 'atlas-candidate',
    role: 'foreground-occlusion',
    path: 'public/realms/assets/visual-forge/v1/atlases/guildhall-foreground-occluders-v1.png',
    alphaRequired: true,
    runtime: false,
  }),
  Object.freeze({
    id: 'guildhall-lighting-atmosphere',
    kind: 'atlas-candidate',
    role: 'lighting-atmosphere',
    path: 'public/realms/assets/visual-forge/v1/atlases/guildhall-lighting-atmosphere-v1.png',
    alphaRequired: true,
    runtime: false,
  }),
  Object.freeze({
    id: 'realm-character-turnaround',
    kind: 'rig-reference',
    role: 'actor-directional-rig',
    path: 'public/realms/assets/visual-forge/v1/characters/realm-character-turnaround-v1.png',
    runtime: false,
  }),
  Object.freeze({
    id: 'realm-character-interaction-poses',
    kind: 'rig-reference',
    role: 'actor-interaction-rig',
    path: 'public/realms/assets/visual-forge/v1/characters/realm-character-interaction-poses-v1.png',
    runtime: false,
  }),
  Object.freeze({
    id: 'guildhall-material-trim-atlas',
    kind: 'material-reference',
    role: 'material-system',
    path: 'public/realms/assets/visual-forge/v1/materials/guildhall-material-trim-atlas-v1.png',
    runtime: false,
  }),
]);

export const REALM_VISUAL_ANCHORS = Object.freeze(REALM_VISUAL_ASSETS.filter((asset) => asset.kind === 'concept'));

export const REALM_VISUAL_LAYER_STACK = Object.freeze([
  Object.freeze({ order: 1, id: 'background-architecture', assetIds: Object.freeze(['guildhall-clean-base-plate', 'guildhall-architecture-shell']) }),
  Object.freeze({ order: 2, id: 'walkable-floor', assetIds: Object.freeze(['guildhall-walkable-floor']) }),
  Object.freeze({ order: 3, id: 'interactive-props', assetIds: Object.freeze(['guildhall-business-landmarks']) }),
  Object.freeze({ order: 4, id: 'actors', assetIds: Object.freeze(['realm-character-turnaround', 'realm-character-interaction-poses']) }),
  Object.freeze({ order: 5, id: 'foreground-occlusion', assetIds: Object.freeze(['guildhall-foreground-occluders']) }),
  Object.freeze({ order: 6, id: 'lighting-atmosphere', assetIds: Object.freeze(['guildhall-lighting-atmosphere']) }),
]);

export const REALM_VISUAL_CHARACTER_FAMILIES = Object.freeze([
  Object.freeze({ id: 'elf-steward', race: 'Elf', guildClass: 'Guild Steward', silhouette: 'tall-narrow', accent: 'forest' }),
  Object.freeze({ id: 'dwarf-engineer', race: 'Dwarf', guildClass: 'Forge Engineer', silhouette: 'short-broad', accent: 'soot' }),
  Object.freeze({ id: 'human-goldkeeper', race: 'Human', guildClass: 'Goldkeeper', silhouette: 'balanced-ledger', accent: 'ink-blue' }),
  Object.freeze({ id: 'half-orc-warden', race: 'Half-Orc', guildClass: 'Project Warden', silhouette: 'tall-broad', accent: 'oxblood' }),
  Object.freeze({ id: 'tiefling-archivist', race: 'Tiefling', guildClass: 'Archivist', silhouette: 'curved-horn', accent: 'violet' }),
]);

export const REALM_VISUAL_BUSINESS_ZONES = Object.freeze([
  Object.freeze({ id: 'command-dais', capability: 'priority-and-decision', landmark: 'raised-map-dais' }),
  Object.freeze({ id: 'guild-roster', capability: 'people-and-access', landmark: 'seal-and-roster-wall' }),
  Object.freeze({ id: 'project-war-table', capability: 'project-execution', landmark: 'inlaid-war-table' }),
  Object.freeze({ id: 'treasury-chest', capability: 'gold-economy', landmark: 'mechanical-gold-vault' }),
  Object.freeze({ id: 'lantern-commons', capability: 'messaging-and-social', landmark: 'lantern-hearth' }),
  Object.freeze({ id: 'council-circle', capability: 'proximity-voice', landmark: 'acoustic-council-ring' }),
  Object.freeze({ id: 'realm-gate', capability: 'entry-and-travel', landmark: 'moonlit-portcullis' }),
  Object.freeze({ id: 'arcane-forge', capability: 'gold-spend-and-crafting', landmark: 'working-guild-forge' }),
]);

export const REALM_VISUAL_MOTION_INVARIANTS = Object.freeze([
  Object.freeze({ source: 'lib/realm-world-v3.js', signals: Object.freeze(['REALM_WORLD_FIXED_STEP', 'stepRealmMotion', 'stepRealmCamera', 'realmFrameBudget']) }),
  Object.freeze({ source: 'components/realm/RealmWorldV3.jsx', signals: Object.freeze(['data-realm-runtime="canvas-2d-fixed-step"', 'REALM_WORLD_FIXED_STEP', 'stepRealmMotion', 'stepRealmCamera', "dynamic(() => import('./RealmRewardRemotion')"]) }),
  Object.freeze({ source: 'components/realm/RealmRewardRemotion.jsx', signals: Object.freeze(['@remotion/player', 'initiallyMuted', 'acknowledgeRemotionLicense']) }),
]);

export const REALM_VISUAL_SCORECARD = Object.freeze([
  Object.freeze({ id: 'character-silhouette', floor: 7.5, target: 8.5, evidence: '64px grayscale lineup and five-family recognition test' }),
  Object.freeze({ id: 'character-materials', floor: 7, target: 8.25, evidence: 'fabric, leather, metal and profession-wear callouts' }),
  Object.freeze({ id: 'environment-architecture', floor: 7.5, target: 8.5, evidence: 'eight zones identifiable without labels' }),
  Object.freeze({ id: 'world-cohesion', floor: 7.5, target: 8.5, evidence: 'shared construction logic, scale and history' }),
  Object.freeze({ id: 'lighting-hierarchy', floor: 7.5, target: 8.5, evidence: 'focal, route and social lighting pass' }),
  Object.freeze({ id: 'spatial-depth', floor: 7, target: 8.25, evidence: 'floor, prop, actor, foreground and light layer proof' }),
  Object.freeze({ id: 'object-identity', floor: 7.5, target: 8.5, evidence: 'eight landmark silhouette comparison' }),
  Object.freeze({ id: 'mobile-readability', floor: 7.5, target: 8.25, evidence: '360x800 and 393x851 gameplay captures' }),
  Object.freeze({ id: 'motion-compatibility', floor: 8.5, target: 9, evidence: 'existing fixed-step and Remotion contract suite stays green' }),
]);

export const REALM_VISUAL_PRODUCTION_GATES = Object.freeze([
  'concept-approved',
  'silhouette-approved',
  'material-approved',
  'layer-extraction-approved',
  'mobile-readability-approved',
  'motion-regression-approved',
  'business-semantics-approved',
]);

export function evaluateRealmVisualForge(scores = {}) {
  const dimensions = REALM_VISUAL_SCORECARD.map((dimension) => {
    const score = Number(scores[dimension.id]);
    const measured = Number.isFinite(score);
    return Object.freeze({
      ...dimension,
      score: measured ? score : null,
      status: !measured ? 'unmeasured' : score >= dimension.target ? 'target' : score >= dimension.floor ? 'review' : 'failed',
    });
  });
  const measured = dimensions.filter((dimension) => dimension.score != null);
  const average = measured.length ? measured.reduce((sum, dimension) => sum + dimension.score, 0) / measured.length : null;
  return Object.freeze({
    version: REALM_VISUAL_FORGE_VERSION,
    dimensions: Object.freeze(dimensions),
    average,
    ready: measured.length === dimensions.length && dimensions.every((dimension) => dimension.status === 'target'),
  });
}
