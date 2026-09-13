import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICE_ACTOR_RADIUS, OFFICE_BOUNDS, OFFICE_SPAWN, OFFICE_PORTALS,
  normalizeOfficePosition, officeToPresence, presenceToOffice, officeDistance,
  officeWalkable, moveOfficeActor, officeSegmentClear, findOfficePath,
  officeKeyVector, officePortalForLegacy,
} from '../lib/realm-office-3d.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);
const positionClose = (actual, expected) => { close(actual.x, expected.x); close(actual.z, expected.z); };

function assertWalkablePath(start, points, colliders) {
  let cursor = start;
  for (const point of points) {
    assert.ok(officeWalkable(point, colliders));
    const samples = Math.max(1, Math.ceil(officeDistance(cursor, point) / 0.05));
    for (let i = 0; i <= samples; i += 1) {
      const fraction = i / samples;
      assert.ok(officeWalkable({ x: cursor.x + (point.x - cursor.x) * fraction, z: cursor.z + (point.z - cursor.z) * fraction }, colliders), 'path crosses a collider or clips a corner');
    }
    cursor = point;
  }
}

test('office coordinates roundtrip through shared presence without distorting valid positions', () => {
  for (const x of [OFFICE_BOUNDS.minX, -7.25, 0, 6.125, OFFICE_BOUNDS.maxX]) {
    for (const z of [OFFICE_BOUNDS.minZ, -3.5, 0, OFFICE_SPAWN.z, OFFICE_BOUNDS.maxZ]) {
      positionClose(presenceToOffice(officeToPresence({ x, z })), { x, z });
    }
  }
  assert.deepEqual(normalizeOfficePosition({ x: 100, z: -100 }), { x: OFFICE_BOUNDS.maxX, z: OFFICE_BOUNDS.minZ });
  assert.deepEqual(normalizeOfficePosition({ x: NaN, z: Infinity }), OFFICE_SPAWN);
  assert.deepEqual(presenceToOffice({ x: NaN, y: 1 }), OFFICE_SPAWN);
});

test('the actor body stays inside the room even after a large movement frame', () => {
  const moved = moveOfficeActor({ x: 0, z: 0 }, { x: 40, z: 40 });
  assert.ok(officeWalkable(moved));
  assert.ok(moved.x <= OFFICE_BOUNDS.maxX - OFFICE_ACTOR_RADIUS);
  assert.ok(moved.z <= OFFICE_BOUNDS.maxZ - OFFICE_ACTOR_RADIUS);
  assert.equal(officeWalkable({ x: OFFICE_BOUNDS.maxX, z: 0 }), false);
  assert.equal(officeWalkable({ x: NaN, z: 0 }), false);
});

test('a long or diagonal movement frame cannot tunnel through walls or a closed corner', () => {
  const wall = [{ minX: -0.05, maxX: 0.05, minZ: -10, maxZ: 10 }];
  const moved = moveOfficeActor({ x: -2, z: -2 }, { x: 6, z: 4 }, wall);
  assert.ok(moved.x <= -0.05 - OFFICE_ACTOR_RADIUS);
  assert.ok(officeWalkable(moved, wall));
  const corner = [
    { minX: -0.2, maxX: 0.2, minZ: -2, maxZ: -0.2 },
    { minX: -2, maxX: -0.2, minZ: -0.2, maxZ: 0.2 },
  ];
  const start = { x: -1, z: -1 }, goal = { x: 1, z: 1 };
  assert.equal(officeSegmentClear(start, goal, corner), false);
  const stopped = moveOfficeActor(start, { x: 2, z: 2 }, corner);
  assert.ok(officeWalkable(stopped, corner));
  assert.ok(stopped.x < 0 && stopped.z < 0, 'diagonal movement cut through the closed corner');
});

test('A* detours around furniture and simplification preserves collision clearance', () => {
  const obstacles = [{ minX: -0.5, maxX: 0.5, minZ: -2, maxZ: 2 }];
  const start = { x: -4, z: 0 }, goal = { x: 4, z: 0 };
  assert.equal(officeSegmentClear(start, goal, obstacles), false);
  const route = findOfficePath(start, goal, obstacles);
  assert.ok(route.length >= 2, 'expected a detour rather than a straight line');
  positionClose(route.at(-1), goal);
  assert.ok(route.some((point) => Math.abs(point.z) >= 2 + OFFICE_ACTOR_RADIUS));
  assertWalkablePath(start, route, obstacles);
});

test('A* refuses an unreachable target inside a sealed enclosure', () => {
  const enclosure = [
    { minX: -2, maxX: 2, minZ: -2, maxZ: -1.8 },
    { minX: -2, maxX: 2, minZ: 1.8, maxZ: 2 },
    { minX: -2, maxX: -1.8, minZ: -2, maxZ: 2 },
    { minX: 1.8, maxX: 2, minZ: -2, maxZ: 2 },
  ];
  assert.ok(officeWalkable({ x: 0, z: 0 }, enclosure));
  assert.deepEqual(findOfficePath({ x: -6, z: 0 }, { x: 0, z: 0 }, enclosure), []);
});

test('A* can leave a walkable position when the rounded grid origin lies inside furniture', () => {
  const obstacles = [
    { minX: -1, maxX: -0.15, minZ: -0.2, maxZ: 0.2 },
    { minX: 1, maxX: 1.3, minZ: -1, maxZ: 1 },
  ];
  const start = { x: 0.2, z: 0 }, goal = { x: 2.5, z: 0 };
  assert.ok(officeWalkable(start, obstacles));
  assert.equal(officeWalkable({ x: 0, z: 0 }, obstacles), false);
  assertWalkablePath(start, [{ x: 0.2, z: 1.5 }, { x: 2.5, z: 1.5 }, goal], obstacles);
  const route = findOfficePath(start, goal, obstacles);
  assert.ok(route.length > 0, 'rounding a valid start into furniture must not trap the actor');
  positionClose(route.at(-1), goal);
  assertWalkablePath(start, route, obstacles);
});

test('keyboard movement follows camera yaw with equal cardinal and diagonal speed', () => {
  positionClose(officeKeyVector(new Set(['w']), 0), { x: 0, z: -1 });
  positionClose(officeKeyVector(new Set(['d']), 0), { x: 1, z: 0 });
  positionClose(officeKeyVector(new Set(['w']), Math.PI / 2), { x: -1, z: 0 });
  positionClose(officeKeyVector(new Set(['arrowright']), Math.PI / 2), { x: 0, z: -1 });
  positionClose(officeKeyVector(new Set(['w', 's', 'a', 'd']), 0.7), { x: 0, z: 0 });
  for (const yaw of [0, Math.PI / 2, Math.PI, 0.7]) {
    const diagonal = officeKeyVector(new Set(['w', 'd']), yaw);
    close(Math.hypot(diagonal.x, diagonal.z), 1);
  }
});

test('every 3D portal opens the exact established ERP companion destination', () => {
  const expected = {
    'quest-board': ['quest-board', 'quests'],
    'project-table': ['war-table', 'campaigns'],
    treasury: ['treasury-chest', 'treasury'],
    archive: ['realm-gate', 'briefing'],
    'guild-hall': ['guild-roster', 'guild'],
    'command-center': ['command-dais', 'command'],
    chronicle: ['arcane-forge', 'profile'],
    embassy: ['tavern-board', 'party'],
  };
  assert.deepEqual(Object.keys(OFFICE_PORTALS).sort(), Object.keys(expected).sort());
  for (const [portal, [legacyId, panel]] of Object.entries(expected)) {
    assert.equal(OFFICE_PORTALS[portal].legacyId, legacyId);
    assert.equal(OFFICE_PORTALS[portal].panel, panel);
    assert.equal(officePortalForLegacy(legacyId), portal);
    assert.equal(officePortalForLegacy(null, panel), portal);
  }
  assert.equal(officePortalForLegacy('war-table', 'quests'), 'project-table', 'an exact object identity must take precedence over a stale panel');
  assert.equal(officePortalForLegacy('unknown', 'unknown'), null);
});
