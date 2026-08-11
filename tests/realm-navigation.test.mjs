import assert from 'node:assert/strict';
import test from 'node:test';

import { findRealmPath } from '../lib/realm-navigation.js';

function gridWithWalls(walls) {
  return (point) => !walls.has(`${Math.floor(point.x)},${Math.floor(point.y)}`);
}

test('Realm pathfinding routes around walls and preserves the requested destination', () => {
  const walls = new Set(['3,1', '3,2', '3,3', '3,4']);
  const target = { x: 5.5, y: 1.5 };
  const path = findRealmPath({
    start: { x: 1.5, y: 1.5 },
    target,
    cols: 7,
    rows: 7,
    isWalkable: gridWithWalls(walls),
  });

  assert.ok(path.length >= 3);
  assert.ok(path.some((point) => point.y === 5.5));
  assert.deepEqual(path.at(-1), target);
  assert.ok(path.every(gridWithWalls(walls)));
});

test('Realm pathfinding returns no journey when a destination is sealed off', () => {
  const walls = new Set(['3,1', '3,2', '3,3', '3,4', '3,5']);
  assert.deepEqual(findRealmPath({
    start: { x: 1.5, y: 1.5 },
    target: { x: 5.5, y: 1.5 },
    cols: 7,
    rows: 7,
    isWalkable: gridWithWalls(walls),
  }), []);
});

test('Realm pathfinding handles interaction targets in the current tile without detours', () => {
  const target = { x: 2.8, y: 2.2 };
  assert.deepEqual(findRealmPath({
    start: { x: 2.4, y: 2.6 },
    target,
    cols: 7,
    rows: 7,
    isWalkable: () => true,
  }), [target]);
});
