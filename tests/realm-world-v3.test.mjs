import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  REALM_RACES,
  REALM_WORLD_FIXED_STEP,
  classifyRealmActor,
  createRealmCameraState,
  createRealmMotionState,
  normalizeRealmWorldPeople,
  realmFrameBudget,
  realmQualityTier,
  realmWorldV3Enabled,
  stepRealmCamera,
  stepRealmMotion,
  transitionRealmInteraction,
} from '../lib/realm-world-v3.js';
import { translateUiCopy } from '../lib/i18n.js';

test('Realm World v3 is enabled by default and preserves an explicit v2 rollback flag', () => {
  assert.equal(realmWorldV3Enabled(undefined), true);
  assert.equal(realmWorldV3Enabled('1'), true);
  assert.equal(realmWorldV3Enabled('0'), false);
  assert.equal(realmWorldV3Enabled('false'), false);
});

test('actor projection exposes five silhouette families and respects an explicit race or guild class', () => {
  assert.deepEqual(REALM_RACES.map((race) => race.id), ['elf', 'dwarf', 'human', 'half-orc', 'tiefling']);
  assert.equal(classifyRealmActor({ id: 'one', role: 'Dwarf · Forge Engineer' }).race.id, 'dwarf');
  assert.equal(classifyRealmActor({ id: 'one', role: 'Dwarf · Forge Engineer' }).guildClass.id, 'engineer');
  assert.equal(classifyRealmActor({ id: 'two', role: 'Half-Orc · Project Warden' }).race.id, 'half-orc');
  assert.equal(classifyRealmActor({ id: 'three', race: 'Tiefling', guildClass: 'Archivist' }).race.id, 'tiefling');
  assert.deepEqual(classifyRealmActor({ id: 'stable-person' }), classifyRealmActor({ id: 'stable-person' }));
});

test('world presence collapses sessions by entity and user and excludes self', () => {
  const people = normalizeRealmWorldPeople({
    entityId: 'egoric',
    self: { entityId: 'egoric', userId: 'self', name: 'Minh Quân' },
    people: [
      { entityId: 'egoric', userId: 'self', name: 'Minh Quân', seenAt: 10 },
      { entityId: 'egoric', userId: 'linh', name: 'Khánh Linh', seenAt: 10, x: 1, y: 2 },
      { entityId: 'egoric', userId: 'linh', name: 'Khánh Linh', seenAt: 20, x: 3, y: 4 },
      { entityId: 'vnecom', userId: 'linh', name: 'Khánh Linh VNE', seenAt: 15, x: 5, y: 6 },
    ],
  });
  assert.equal(people.length, 2);
  assert.equal(people.find((person) => person.realmIdentity === 'egoric:linh').x, 3);
  assert.ok(people.every((person) => person.archetype?.race));
});

test('fixed-step locomotion accelerates, decelerates and never crosses a blocked axis', () => {
  let state = createRealmMotionState({ x: 2, y: 2 });
  for (let frame = 0; frame < 90; frame += 1) {
    const previous = state;
    state = stepRealmMotion(state, { x: 1, y: 0 }, REALM_WORLD_FIXED_STEP, { isWalkable: () => true });
    assert.ok(state.x - previous.x <= 4.65 / 60 + 1e-8, 'one frame must not teleport');
  }
  assert.equal(state.facing, 'right');
  assert.ok(state.distanceTravelled > 4);
  const movingX = state.x;
  for (let frame = 0; frame < 40; frame += 1) state = stepRealmMotion(state, {}, REALM_WORLD_FIXED_STEP, { isWalkable: () => true });
  assert.equal(state.locomotion, 'idle');
  assert.ok(state.x >= movingX);

  const blocked = stepRealmMotion({ ...createRealmMotionState({ x: 2, y: 2 }), vx: 4, facing: 'right' }, { x: 1 }, REALM_WORLD_FIXED_STEP, {
    isWalkable: (point) => point.x <= 2,
  });
  assert.equal(blocked.x, 2);
  assert.equal(blocked.vx, 0);
});

test('camera spring bounds a single-frame correction and converges without a CSS scene jump', () => {
  let camera = createRealmCameraState({ x: 0, y: 0 });
  const first = stepRealmCamera(camera, { x: 30, y: 20 }, REALM_WORLD_FIXED_STEP);
  assert.ok(Math.abs(first.x - camera.x) <= 18 / 60 + 1e-8);
  assert.ok(Math.abs(first.y - camera.y) <= 18 / 60 + 1e-8);
  camera = first;
  for (let frame = 0; frame < 240; frame += 1) camera = stepRealmCamera(camera, { x: 30, y: 20 }, REALM_WORLD_FIXED_STEP);
  assert.ok(Math.abs(camera.x - 30) < .02);
  assert.ok(Math.abs(camera.y - 20) < .02);
});

test('object interaction contract rejects impossible jumps', () => {
  assert.equal(transitionRealmInteraction('idle', 'targeted'), 'targeted');
  assert.equal(transitionRealmInteraction('targeted', 'approached'), 'approached');
  assert.equal(transitionRealmInteraction('approached', 'ready'), 'ready');
  assert.equal(transitionRealmInteraction('ready', 'acting'), 'acting');
  assert.equal(transitionRealmInteraction('acting', 'pending'), 'pending');
  assert.equal(transitionRealmInteraction('pending', 'succeeded'), 'succeeded');
  assert.equal(transitionRealmInteraction('idle', 'succeeded'), 'idle');
});

test('quality tier and performance budget keep mobile rendering bounded', () => {
  assert.equal(realmQualityTier({ width: 390, devicePixelRatio: 3 }).id, 'low');
  assert.equal(realmQualityTier({ width: 900, devicePixelRatio: 2 }).id, 'medium');
  assert.equal(realmQualityTier({ width: 1440, devicePixelRatio: 1 }).id, 'high');
  assert.deepEqual(realmFrameBudget([16, 17, 15, 18]), { average: 16.5, p95: 18, fps: 1000 / 16.5 });
});

test('v3 component owns continuous motion over one unified 2.5D scene plate', () => {
  const source = fs.readFileSync(new URL('../components/realm/RealmWorldV3.jsx', import.meta.url), 'utf8');
  assert.match(source, /data-realm-runtime="canvas-2d-fixed-step"/);
  assert.match(source, /data-realm-depth="2\.5d"/);
  assert.match(source, /data-realm-art-ready/);
  assert.match(source, /REALM_WORLD_FIXED_STEP/);
  assert.match(source, /stepSteeredMotion/);
  assert.match(source, /REALM_MOVEMENT_VERSION/);
  assert.match(source, /createMovementIntent/);
  assert.match(source, /reserveInteractionSlot/);
  assert.match(source, /reservePortalPassage/);
  assert.match(source, /sampleRemoteSnapshot/);
  assert.match(source, /advanceActivityState/);
  assert.match(source, /cameraTargetWithDeadZone/);
  assert.match(source, /stepRealmCamera/);
  assert.match(source, /normalizeRealmWorldPeople/);
  assert.match(source, /Canonical receipt đã xác nhận/);
  assert.match(source, /REALM_CHARACTER_ATLAS_ROWS/);
  assert.match(source, /drawArchitectureOccluder/);
  assert.match(source, /demo-elf/);
  assert.match(source, /demo-dwarf/);
  assert.doesNotMatch(source, /@remotion\/player/);
  assert.doesNotMatch(source, /guildhall-environment\.png/);
  assert.doesNotMatch(source, /style=\{\{\s*top:/);
});

test('Remotion is lazy-mounted for the receipt-bound reward sequence, not the continuous world', () => {
  const worldSource = fs.readFileSync(new URL('../components/realm/RealmWorldV3.jsx', import.meta.url), 'utf8');
  const rewardSource = fs.readFileSync(new URL('../components/realm/RealmRewardRemotion.jsx', import.meta.url), 'utf8');
  assert.match(worldSource, /dynamic\(\(\) => import\('\.\/RealmRewardRemotion'\)/);
  assert.match(worldSource, /rewardCallout &&/);
  assert.match(rewardSource, /@remotion\/player/);
  assert.match(rewardSource, /initiallyMuted/);
  assert.match(rewardSource, /acknowledgeRemotionLicense/);
  assert.doesNotMatch(rewardSource, /loop=\{true\}/);
});

test('Realm World v3 UI copy switches between Vietnamese and English without changing business data', () => {
  assert.equal(translateUiCopy('Phòng điều hành', 'vi'), 'Phòng điều hành');
  assert.equal(translateUiCopy('Phòng điều hành', 'en'), 'Operations Room');
  assert.equal(translateUiCopy('Canonical receipt đã xác nhận', 'en'), 'Canonical receipt confirmed');
  assert.equal(translateUiCopy('Cử chỉ xuất hiện trên cơ thể, không chỉ là thông báo.', 'en'), 'The gesture appears on the character, not only as a notification.');
  assert.equal(translateUiCopy('Khánh Linh', 'en'), 'Khánh Linh');
});
