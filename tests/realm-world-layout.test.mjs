import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadWorldModule() {
  const source = await readFile(path.join(ROOT, 'components', 'realm', 'world.js'), 'utf8');
  const runnable = source.replace(
    "import { REALM_TREASURY_CATALOG } from '@/lib/realm-treasury';",
    'const REALM_TREASURY_CATALOG = [];',
  );
  return import(`data:text/javascript;base64,${Buffer.from(runnable).toString('base64')}`);
}

test('expanded Realm is at least twice the former world area and keeps six business rooms', async () => {
  const { ROOMS, WORLD } = await loadWorldModule();
  assert.ok(WORLD.cols * WORLD.rows >= 38 * 24 * 2);
  assert.equal(ROOMS.length, 6);
  for (const room of ROOMS) {
    assert.ok(room.x >= 1 && room.y >= 1);
    assert.ok(room.x + room.w <= WORLD.cols - 1);
    assert.ok(room.y + room.h <= WORLD.rows - 1);
  }
});

test('spawn, business objects and staff remain inside walkable rooms', async () => {
  const {
    DEFAULT_WORLD_POSITION,
    STAFF,
    WORLD_OBJECTS,
    isWorldPositionWalkable,
    roomAt,
  } = await loadWorldModule();
  for (const point of [DEFAULT_WORLD_POSITION, ...WORLD_OBJECTS, ...STAFF]) {
    assert.ok(roomAt(point.x, point.y), `${point.id || 'default spawn'} must be inside a room`);
    assert.ok(isWorldPositionWalkable(point), `${point.id || 'default spawn'} must not intersect a wall`);
  }
});

test('saved positions are clamped and wall collisions migrate to the safe spawn', async () => {
  const { DEFAULT_WORLD_POSITION, normalizeWorldPosition } = await loadWorldModule();
  assert.deepEqual(normalizeWorldPosition({ x: -10, y: 999 }), DEFAULT_WORLD_POSITION);
  assert.deepEqual(normalizeWorldPosition({ x: 18, y: 12 }), DEFAULT_WORLD_POSITION);
  assert.deepEqual(normalizeWorldPosition({ x: 29, y: 23 }), { x: 29, y: 23 });
});
