import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findRealmPath } from '../lib/realm-navigation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadWorldModule() {
  const source = await readFile(path.join(ROOT, 'components', 'realm', 'world.js'), 'utf8');
  const runnable = source.replace(
    "import { REALM_TREASURY_CATALOG } from '@/lib/realm-treasury';",
    'const REALM_TREASURY_CATALOG = [];',
  );
  return import(`data:text/javascript;base64,${Buffer.from(runnable).toString('base64')}`);
}

test('unified Realm keeps a large continuous hall with six semantic business zones', async () => {
  const { ROOMS, WORLD } = await loadWorldModule();
  assert.ok(WORLD.cols * WORLD.rows >= 38 * 24 * 2);
  assert.equal(ROOMS.length, 6);
  for (const room of ROOMS) {
    assert.ok(room.x >= 1 && room.y >= 1);
    assert.ok(room.x + room.w <= WORLD.cols - 1);
    assert.ok(room.y + room.h <= WORLD.rows - 1);
  }
});

test('spawn remains walkable while every business object owns a blocking footprint and safe approaches', async () => {
  const {
    DEFAULT_WORLD_POSITION,
    STAFF,
    WORLD_OBJECTS,
    distance,
    isWorldPositionWalkable,
    objectInteractionPoints,
    roomAt,
    worldCollisionAt,
  } = await loadWorldModule();
  for (const point of [DEFAULT_WORLD_POSITION, ...STAFF]) {
    assert.ok(roomAt(point.x, point.y), `${point.id || 'default spawn'} must be inside a room`);
    assert.ok(isWorldPositionWalkable(point), `${point.id || 'default spawn'} must not intersect a wall`);
  }
  assert.ok(
    Math.min(...WORLD_OBJECTS.map((object) => distance(DEFAULT_WORLD_POSITION, object))) > 1.85,
    'default spawn must not immediately replace primary HUD controls with an object action ribbon',
  );
  for (const object of WORLD_OBJECTS) {
    assert.ok(roomAt(object.x, object.y), `${object.id} must stay inside a semantic room`);
    assert.equal(isWorldPositionWalkable(object), false, `${object.id} must block actor movement`);
    assert.equal(worldCollisionAt(object)?.id, object.id);
    const approaches = objectInteractionPoints(object);
    assert.ok(approaches.length >= 2, `${object.id} needs multiple safe interaction approaches`);
    assert.ok(approaches.every(isWorldPositionWalkable));
  }
});

test('saved positions are clamped and wall collisions migrate to the safe spawn', async () => {
  const { DEFAULT_WORLD_POSITION, normalizeWorldPosition } = await loadWorldModule();
  assert.deepEqual(normalizeWorldPosition({ x: -10, y: 999 }), DEFAULT_WORLD_POSITION);
  assert.deepEqual(normalizeWorldPosition({ x: 2, y: 2 }), DEFAULT_WORLD_POSITION);
  assert.deepEqual(normalizeWorldPosition({ x: 24, y: 20.5 }), DEFAULT_WORLD_POSITION);
});

test('unified scene geometry blocks the walls visible in the plate and preserves intentional portals', async () => {
  const { REALM_NAV_PORTALS, isWorldPositionWalkable, worldCollisionAt } = await loadWorldModule();
  assert.deepEqual(REALM_NAV_PORTALS.map((portal) => portal.id), ['council-stair', 'eastern-stair', 'south-gate']);
  assert.ok(REALM_NAV_PORTALS.every((portal) => portal.capacity >= 1));
  assert.equal(worldCollisionAt({ x: 21.5, y: 13.1 })?.id, 'command-balustrade');
  assert.equal(worldCollisionAt({ x: 10, y: 15.5 })?.id, 'western-gallery-wall');
  assert.equal(worldCollisionAt({ x: 18, y: 19.35 })?.id, 'council-ring');
  assert.equal(worldCollisionAt({ x: 10, y: 35 })?.id, 'south-wall-west');
  assert.equal(isWorldPositionWalkable({ x: 24, y: 24.7 }), true, 'council stair portal must remain traversable');
  assert.equal(isWorldPositionWalkable({ x: 24, y: 36.5 }), true, 'south gate must remain traversable');
});

test('pathfinding detours around the command rail and enters the council through its stair portal', async () => {
  const { WORLD, isWorldPositionWalkable } = await loadWorldModule();
  const path = findRealmPath({
    start: { x: 21.5, y: 9.5 },
    target: { x: 24, y: 22.5 },
    cols: WORLD.cols,
    rows: WORLD.rows,
    isWalkable: isWorldPositionWalkable,
  });
  assert.ok(path.length >= 2, 'route should detour rather than cut across the visible wall');
  assert.ok(path.every(isWorldPositionWalkable));
  assert.ok(path.some((point) => point.y >= 23.45 && point.x >= 22.35 && point.x <= 25.65), 'route must use the council stair portal');
});
