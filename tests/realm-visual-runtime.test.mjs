import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  REALM_OBJECT_VISUALS,
  REALM_OCCLUDER_NODES,
  REALM_RUNTIME_ASSET_URLS,
  REALM_RUNTIME_CHARACTER_URLS,
  REALM_WORLD_Y_SCALE,
  projectRealmY,
  realmAtlasFrame,
  realmInteractionEnvelope,
  realmObjectFacing,
  unprojectRealmY,
} from '../lib/realm-visual-runtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('runtime art pack is a bounded WebP bundle rather than loading preproduction PNGs', () => {
  let totalBytes = 0;
  for (const assetUrl of Object.values(REALM_RUNTIME_ASSET_URLS)) {
    assert.match(assetUrl, /^\/realms\/assets\/runtime\/v3-2_5d\/.+\.webp$/);
    const assetPath = path.join(ROOT, 'public', assetUrl.replace(/^\//, ''));
    const bytes = fs.readFileSync(assetPath);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
    assert.ok(bytes.length < 400_000, `${path.basename(assetPath)} exceeds its 400KB runtime budget`);
    totalBytes += bytes.length;
  }
  assert.ok(totalBytes < 1_500_000, `runtime art pack is ${totalBytes} bytes`);
});

test('runtime character sheets are isolated copies and stay within the mobile transfer budget', () => {
  let totalBytes = 0;
  for (const assetUrl of Object.values(REALM_RUNTIME_CHARACTER_URLS)) {
    assert.match(assetUrl, /^\/realms\/assets\/runtime\/v3-2_5d\/.+\.png$/);
    const assetPath = path.join(ROOT, 'public', assetUrl.replace(/^\//, ''));
    const bytes = fs.readFileSync(assetPath);
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
    totalBytes += bytes.length;
  }
  assert.ok(totalBytes < 3_200_000, `runtime character pack is ${totalBytes} bytes`);
});

test('2.5D world projection is intentional and reversible', () => {
  assert.ok(REALM_WORLD_Y_SCALE > .6 && REALM_WORLD_Y_SCALE < .85);
  for (const [worldY, tile] of [[0, 32], [12.75, 48], [36, 21.5]]) {
    const projected = projectRealmY(worldY, tile);
    assert.ok(Math.abs(unprojectRealmY(projected, tile) - worldY) < Number.EPSILON * 10);
  }
  assert.deepEqual(realmAtlasFrame(7, 4, 3), { column: 3, row: 1, columns: 4, rows: 3 });
  assert.deepEqual(realmAtlasFrame(999, 4, 3), { column: 3, row: 2, columns: 4, rows: 3 });
});

test('all eight canonical business objects own a distinct visual and environmental response', () => {
  const entries = Object.entries(REALM_OBJECT_VISUALS);
  assert.equal(entries.length, 8);
  assert.deepEqual(entries.map(([, visual]) => visual.frame).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(entries.map(([, visual]) => visual.response)).size, 8);
  for (const [, visual] of entries) {
    assert.ok(visual.width >= 3.7);
    assert.ok(visual.height >= 3.8);
  }
});

test('foreground scene nodes provide doorway and prop occlusion without duplicate identities', () => {
  assert.ok(REALM_OCCLUDER_NODES.length >= 12);
  assert.equal(new Set(REALM_OCCLUDER_NODES.map((node) => node.id)).size, REALM_OCCLUDER_NODES.length);
  assert.ok(REALM_OCCLUDER_NODES.filter((node) => node.id.startsWith('arch-')).length >= 7);
  assert.ok(REALM_OCCLUDER_NODES.some((node) => node.highDetail));
});

test('interaction response ramps, settles and turns the actor toward the object', () => {
  const startedAt = 1_000;
  assert.equal(realmInteractionEnvelope(startedAt, 999, 'acting'), 0);
  assert.equal(realmInteractionEnvelope(startedAt, startedAt, 'acting'), 0);
  assert.ok(realmInteractionEnvelope(startedAt, startedAt + 140, 'acting') > .6);
  assert.equal(realmInteractionEnvelope(startedAt, startedAt + 280, 'acting'), 1);
  assert.equal(realmInteractionEnvelope(startedAt, startedAt + 1_500, 'succeeded'), 0);

  assert.equal(realmObjectFacing({ x: 2, y: 2 }, { x: 8, y: 2 }), 'right');
  assert.equal(realmObjectFacing({ x: 2, y: 2 }, { x: 2, y: -4 }), 'up');
  assert.equal(realmObjectFacing({ x: 2, y: 2 }, { x: 5, y: 5 }), 'down-right');
});

test('live component consumes the runtime scene graph without replacing fixed-step locomotion', () => {
  const source = fs.readFileSync(path.join(ROOT, 'components/realm/RealmWorldV3.jsx'), 'utf8');
  assert.match(source, /data-realm-depth="2\.5d"/);
  assert.match(source, /data-realm-art-ready/);
  assert.match(source, /drawObjectVisual/);
  assert.match(source, /drawOccluder/);
  assert.match(source, /realmObjectFacing/);
  assert.match(source, /drawForgedActorSkin/);
  assert.match(source, /removeWhiteMatte/);
  assert.match(source, /REALM_WORLD_FIXED_STEP/);
  assert.doesNotMatch(source, /\/visual-forge\/v1\//);
});
