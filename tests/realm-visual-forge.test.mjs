import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  REALM_VISUAL_ANCHORS,
  REALM_VISUAL_ASSETS,
  REALM_VISUAL_BUSINESS_ZONES,
  REALM_VISUAL_CHARACTER_FAMILIES,
  REALM_VISUAL_MOTION_INVARIANTS,
  REALM_VISUAL_LAYER_STACK,
  REALM_VISUAL_SCORECARD,
  evaluateRealmVisualForge,
} from '../lib/realm-visual-forge.js';
import { auditRealmVisualForge } from '../scripts/lib/realm-visual-forge-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Visual Forge locks five distinct class silhouettes and eight business landmarks', () => {
  assert.equal(REALM_VISUAL_CHARACTER_FAMILIES.length, 5);
  assert.equal(new Set(REALM_VISUAL_CHARACTER_FAMILIES.map((family) => family.silhouette)).size, 5);
  assert.deepEqual(REALM_VISUAL_CHARACTER_FAMILIES.map((family) => family.race), ['Elf', 'Dwarf', 'Human', 'Half-Orc', 'Tiefling']);
  assert.equal(REALM_VISUAL_BUSINESS_ZONES.length, 8);
  assert.equal(new Set(REALM_VISUAL_BUSINESS_ZONES.map((zone) => zone.landmark)).size, 8);
});

test('Visual Forge treats generated images as a complete six-layer preproduction pack, not runtime shortcuts', () => {
  assert.equal(REALM_VISUAL_ANCHORS.length, 2);
  assert.ok(REALM_VISUAL_ANCHORS.every((anchor) => anchor.kind === 'concept' && anchor.runtime === false));
  assert.equal(REALM_VISUAL_ASSETS.length, 11);
  assert.ok(REALM_VISUAL_ASSETS.every((asset) => asset.runtime === false));
  assert.deepEqual(REALM_VISUAL_LAYER_STACK.map((layer) => layer.id), [
    'background-architecture',
    'walkable-floor',
    'interactive-props',
    'actors',
    'foreground-occlusion',
    'lighting-atmosphere',
  ]);
  const result = auditRealmVisualForge(root);
  assert.equal(result.summary.verifiedAnchors, 2);
  assert.equal(result.summary.verifiedAssets, 11);
  assert.equal(result.summary.preproductionShortcutAbsent, true);
  assert.ok(result.assets.filter((asset) => asset.alphaRequired).every((asset) => asset.hasAlphaChannel));
});

test('Visual Forge cannot approve visuals without every AAA target', () => {
  assert.ok(REALM_VISUAL_SCORECARD.every((dimension) => dimension.floor >= 7 && dimension.target >= 8));
  const targetScores = Object.fromEntries(REALM_VISUAL_SCORECARD.map((dimension) => [dimension.id, dimension.target]));
  assert.equal(evaluateRealmVisualForge(targetScores).ready, true);
  assert.equal(evaluateRealmVisualForge({ ...targetScores, 'character-silhouette': 7.9 }).ready, false);
  assert.equal(evaluateRealmVisualForge({}).ready, false);
});

test('Visual Forge keeps fixed-step world motion and receipt-bound Remotion under contract', () => {
  assert.deepEqual(REALM_VISUAL_MOTION_INVARIANTS.map((contract) => contract.source), [
    'lib/realm-world-v3.js',
    'components/realm/RealmWorldV3.jsx',
    'components/realm/RealmRewardRemotion.jsx',
  ]);
  const result = auditRealmVisualForge(root);
  assert.equal(result.summary.passed, true, JSON.stringify(result.failures, null, 2));
  assert.ok(result.motionContracts.every((contract) => contract.status === 'verified'));
});
