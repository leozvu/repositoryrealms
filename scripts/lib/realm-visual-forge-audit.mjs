import fs from 'node:fs';
import path from 'node:path';

import {
  REALM_VISUAL_ANCHORS,
  REALM_VISUAL_ASSETS,
  REALM_VISUAL_BUSINESS_ZONES,
  REALM_VISUAL_CHARACTER_FAMILIES,
  REALM_VISUAL_LAYER_STACK,
  REALM_VISUAL_MOTION_INVARIANTS,
  REALM_VISUAL_PRODUCTION_GATES,
  REALM_VISUAL_SCORECARD,
} from '../../lib/realm-visual-forge.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PREPRODUCTION_MAX_BYTES = 5_000_000;

const SPEC_CONTRACTS = Object.freeze([
  Object.freeze({ source: 'docs/realms/visual-forge/REALM-VISUAL-FORGE-V1.md', signals: Object.freeze(['Motion lock', 'believable medieval workplace', 'No runtime integration by concept shortcut', 'AAA review gate']) }),
  Object.freeze({ source: 'docs/realms/visual-forge/REALM-CHARACTER-BIBLE-V1.md', signals: Object.freeze(['Elf · Guild Steward', 'Dwarf · Forge Engineer', 'Human · Goldkeeper', 'Half-Orc · Project Warden', 'Tiefling · Archivist', '64 px']) }),
  Object.freeze({ source: 'docs/realms/visual-forge/REALM-ENVIRONMENT-BIBLE-V1.md', signals: Object.freeze(['Background architecture', 'Walkable floor', 'Interactive props', 'Actors', 'Foreground occlusion', 'Lighting and atmosphere']) }),
  Object.freeze({ source: 'docs/realms/visual-forge/IMAGEGEN-PROMPTS-V1.md', signals: Object.freeze(['character-lineup', 'guildhall-architecture-shell', 'guildhall-lighting-atmosphere', 'realm-character-interaction-poses', 'guildhall-material-trim-atlas']) }),
]);

function inspectTextContract(root, contract, kind) {
  const file = path.join(root, contract.source);
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const missingSignals = contract.signals.filter((signal) => !content.includes(signal));
  return { kind, source: contract.source, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
}

function inspectAsset(root, asset) {
  const file = path.join(root, asset.path);
  const exists = fs.existsSync(file);
  const content = exists ? fs.readFileSync(file) : Buffer.alloc(0);
  const isPng = content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const pngColorType = isPng ? content[25] : null;
  const hasAlphaChannel = pngColorType === 4 || pngColorType === 6;
  const withinPreproductionBudget = content.length > 0 && content.length <= PREPRODUCTION_MAX_BYTES;
  return {
    kind: 'visual-asset',
    id: asset.id,
    role: asset.role,
    source: asset.path,
    exists,
    bytes: content.length,
    isPng,
    hasAlphaChannel,
    alphaRequired: asset.alphaRequired === true,
    runtime: asset.runtime,
    status: exists && isPng && withinPreproductionBudget && asset.runtime === false && (!asset.alphaRequired || hasAlphaChannel) ? 'verified' : 'failed',
  };
}

export function auditRealmVisualForge(root) {
  const assets = REALM_VISUAL_ASSETS.map((asset) => inspectAsset(root, asset));
  const anchors = assets.filter((asset) => REALM_VISUAL_ANCHORS.some((anchor) => anchor.id === asset.id));
  const specifications = SPEC_CONTRACTS.map((contract) => inspectTextContract(root, contract, 'specification'));
  const motionContracts = REALM_VISUAL_MOTION_INVARIANTS.map((contract) => inspectTextContract(root, contract, 'motion-invariant'));
  const worldSourcePath = path.join(root, 'components/realm/RealmWorldV3.jsx');
  const worldSource = fs.existsSync(worldSourcePath) ? fs.readFileSync(worldSourcePath, 'utf8') : '';
  const preproductionShortcutAbsent = !worldSource.includes('/visual-forge/v1/');
  const scorecardValid = REALM_VISUAL_SCORECARD.every((dimension) => dimension.floor >= 7 && dimension.target >= 8 && dimension.target > dimension.floor);
  const structureValid = REALM_VISUAL_CHARACTER_FAMILIES.length === 5
    && new Set(REALM_VISUAL_CHARACTER_FAMILIES.map((family) => family.silhouette)).size === 5
    && REALM_VISUAL_BUSINESS_ZONES.length === 8
    && new Set(REALM_VISUAL_BUSINESS_ZONES.map((zone) => zone.landmark)).size === 8
    && REALM_VISUAL_LAYER_STACK.length === 6
    && REALM_VISUAL_LAYER_STACK.every((layer, index) => layer.order === index + 1 && layer.assetIds.every((assetId) => REALM_VISUAL_ASSETS.some((asset) => asset.id === assetId)));
  const gatesValid = REALM_VISUAL_PRODUCTION_GATES.length >= 7
    && REALM_VISUAL_PRODUCTION_GATES.includes('motion-regression-approved')
    && REALM_VISUAL_PRODUCTION_GATES.includes('business-semantics-approved');
  const allContracts = [...assets, ...specifications, ...motionContracts];
  const failures = allContracts.filter((contract) => contract.status !== 'verified');

  if (!preproductionShortcutAbsent) failures.push({ kind: 'runtime-boundary', status: 'failed', reason: 'A preproduction image was wired directly into the runtime renderer before layer approval' });
  if (!scorecardValid) failures.push({ kind: 'scorecard', status: 'failed', reason: 'Visual quality floor or target is too low' });
  if (!structureValid) failures.push({ kind: 'structure', status: 'failed', reason: 'Character or zone identity is incomplete or duplicated' });
  if (!gatesValid) failures.push({ kind: 'production-gates', status: 'failed', reason: 'Motion or business-semantics approval is missing' });

  return {
    schemaVersion: 1,
    summary: {
      anchors: anchors.length,
      verifiedAnchors: anchors.filter((anchor) => anchor.status === 'verified').length,
      assets: assets.length,
      verifiedAssets: assets.filter((asset) => asset.status === 'verified').length,
      layerStack: REALM_VISUAL_LAYER_STACK.length,
      characterFamilies: REALM_VISUAL_CHARACTER_FAMILIES.length,
      businessZones: REALM_VISUAL_BUSINESS_ZONES.length,
      scoreDimensions: REALM_VISUAL_SCORECARD.length,
      productionGates: REALM_VISUAL_PRODUCTION_GATES.length,
      motionContracts: motionContracts.length,
      preproductionShortcutAbsent,
      passed: failures.length === 0,
    },
    assets,
    anchors,
    specifications,
    motionContracts,
    failures,
  };
}
