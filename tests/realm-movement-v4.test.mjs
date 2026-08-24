import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REALM_MOVEMENT_VERSION,
  advanceActivityState,
  cameraTargetWithDeadZone,
  canReplaceMovementIntent,
  computeLocalAvoidance,
  createActivityState,
  createMovementIntent,
  createRemoteSnapshotBuffer,
  movementProfile,
  personalSpaceOverlap,
  portalForSegment,
  pushRemoteSnapshot,
  reconcileRemoteTarget,
  releasePortalPassage,
  reservePortalPassage,
  sampleRemoteSnapshot,
  stepSteeredMotion,
} from '../lib/realm-movement-v4.js';

test('movement v4 grants manual control authority over ambient intents', () => {
  assert.equal(REALM_MOVEMENT_VERSION, 4);
  const commute = createMovementIntent('commute', { x: 2, y: 3 });
  const manual = createMovementIntent('manual', null, { source: 'keyboard' });
  assert.equal(canReplaceMovementIntent(commute, manual), true);
  assert.equal(canReplaceMovementIntent(manual, commute), false);
  assert.equal(movementProfile('player').priority, 100);
  assert.ok(movementProfile('npc').maxSpeed < movementProfile('player').maxSpeed);
});

test('steered movement anticipates arrival and stops without overshooting the target', () => {
  let state = { x: 0, y: 0, vx: 0, vy: 0, facing: 'right', gaitTime: 0, distanceTravelled: 0 };
  let maxX = state.x;
  for (let frame = 0; frame < 360; frame += 1) {
    state = stepSteeredMotion(state, { x: 4, y: 0 }, 1 / 60, { kind: 'player', isWalkable: () => true });
    maxX = Math.max(maxX, state.x);
  }
  assert.ok(Math.abs(state.x - 4) < .16, `arrival error was ${Math.abs(state.x - 4)}`);
  assert.ok(maxX <= 4.16, `overshoot was ${maxX - 4}`);
  assert.ok(Math.hypot(state.vx, state.vy) < .12);
  assert.equal(state.locomotion, 'idle');
});

test('swept movement cannot tunnel through a thin blocker', () => {
  let state = { x: 0, y: 0, vx: 0, vy: 0, facing: 'right', gaitTime: 0, distanceTravelled: 0 };
  const isWalkable = (point) => point.x < 1.12 || point.x > 1.32;
  for (let frame = 0; frame < 120; frame += 1) {
    state = stepSteeredMotion(state, { x: 4, y: 0 }, 1 / 60, { kind: 'player', isWalkable });
  }
  assert.ok(state.x < 1.12);
  assert.ok(state.collisionCount > 0);
});

test('lower-priority actors yield and separate while the player keeps right of way', () => {
  const npc = { id: 'npc', x: 1, y: 1, vx: 1, vy: 0, radius: .3, priority: 25 };
  const player = { id: 'player', x: 1.42, y: 1, vx: -1, vy: 0, radius: .3, priority: 100 };
  const npcAvoidance = computeLocalAvoidance(npc, [player]);
  const playerAvoidance = computeLocalAvoidance(player, [npc]);
  assert.equal(npcAvoidance.yielding, true);
  assert.ok(npcAvoidance.speedFactor < playerAvoidance.speedFactor);
  assert.equal(personalSpaceOverlap(npc, player), true);
});

test('narrow passages serialize NPCs and allow the player to take priority', () => {
  const portal = { id: 'stair', minX: 1, maxX: 2, minY: 1, maxY: 3, capacity: 1 };
  assert.equal(portalForSegment({ x: 1.5, y: 0 }, { x: 1.5, y: 4 }, [portal])?.id, 'stair');
  const book = new Map();
  assert.equal(reservePortalPassage(book, { id: 'npc', priority: 25 }, portal, 1000).granted, true);
  assert.equal(reservePortalPassage(book, { id: 'npc-2', priority: 25 }, portal, 1000).granted, false);
  const player = reservePortalPassage(book, { id: 'player', priority: 100 }, portal, 1000);
  assert.equal(player.granted, true);
  assert.equal(player.preempted, 'npc');
  releasePortalPassage(book, 'player');
  assert.equal(book.has('stair'), false);
});

test('remote snapshots interpolate, predict briefly and reserve waygate for large corrections', () => {
  const buffer = createRemoteSnapshotBuffer({ x: 0, y: 0, at: 0 });
  pushRemoteSnapshot(buffer, { x: 2, y: 0, at: 200 });
  const interpolated = sampleRemoteSnapshot(buffer, 240, { interpolationDelay: 140 });
  assert.equal(interpolated.mode, 'interpolate');
  assert.ok(interpolated.x > 0 && interpolated.x < 2);
  const predicted = sampleRemoteSnapshot(buffer, 500, { interpolationDelay: 140, maxPredictionMs: 220 });
  assert.equal(predicted.mode, 'predict');
  const soft = reconcileRemoteTarget({ x: 0, y: 0 }, { x: 2, y: 0 }, 1 / 60);
  assert.ok(soft.correction <= .35);
  assert.notEqual(soft.mode, 'waygate');
  assert.equal(reconcileRemoteTarget({ x: 0, y: 0 }, { x: 8, y: 0 }, 1 / 60).mode, 'waygate');
});

test('activity director dwells after commuting instead of looping continuously', () => {
  const initial = createActivityState({ id: 'demo-dwarf', routine: [{}, {}] }, 1000);
  assert.equal(initial.phase, 'idle');
  const commute = advanceActivityState({ ...initial, nextDecisionAt: 1000 }, 1000, { routineLength: 2 });
  assert.equal(commute.phase, 'commute');
  const interact = advanceActivityState({ ...commute, nextDecisionAt: 2000 }, 2000, { routineLength: 2, dwellMs: 7000 });
  assert.equal(interact.phase, 'interact');
  assert.equal(interact.nextDecisionAt, 9000);
});

test('camera dead-zone ignores micro-corrections and adds bounded look-ahead', () => {
  const camera = { x: 10, y: 10 };
  assert.deepEqual(cameraTargetWithDeadZone(camera, { x: 10.2, y: 10.1, vx: 0, vy: 0 }, { halfW: 8, halfH: 6 }), camera);
  const target = cameraTargetWithDeadZone(camera, { x: 14, y: 10, vx: 3, vy: 0 }, { halfW: 8, halfH: 6 });
  assert.ok(target.x > 12 && target.x < 15);
  assert.equal(target.y, 10);
});
