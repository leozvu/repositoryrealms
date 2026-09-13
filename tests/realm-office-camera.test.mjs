import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { constrainOfficeCamera } from '../lib/realm-office-camera.js';
import { buildGuildhallScene } from '../components/realm/three/guildhallScene.js';
import { OFFICE_SPAWN, officeArrivalReady, officeDistance, findOfficePath, moveOfficeActor } from '../lib/realm-office-3d.js';

test('camera boom stops before a thin wall and does not block a clear overhead view', () => {
  const wall = { minX: -5, maxX: 5, minZ: -4.81, maxZ: -4.8, cameraBounds: { minY: 0, maxY: 3 } };
  const clipped = constrainOfficeCamera({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 2.9, z: -10 }, [wall]);
  assert.ok(clipped.z > -4.62 && clipped.z < -4.5);
  assert.ok(clipped.y > 1.2 && clipped.y < 2.9);
  assert.deepEqual(constrainOfficeCamera({ x: 0, y: 4, z: 0 }, { x: 0, y: 4, z: -10 }, [wall]), { x: 0, y: 4, z: -10 });
  assert.deepEqual(constrainOfficeCamera({ x: 6, y: 1.2, z: 0 }, { x: 6, y: 2, z: -10 }, [wall]), { x: 6, y: 2, z: -10 });
});

test('parallel, diagonal and zero-length camera paths are bounded and finite', () => {
  const wall = { minX: -.05, maxX: .05, minZ: -3, maxZ: 3, cameraBounds: { minY: 0, maxY: 5 } };
  const anchor = { x: -2, y: 1.2, z: -1 };
  const clipped = constrainOfficeCamera(anchor, { x: 2, y: 3, z: 1 }, [wall]);
  assert.ok(clipped.x < -.23);
  assert.deepEqual(constrainOfficeCamera(anchor, anchor, [wall]), anchor);
  assert.ok(Object.values(clipped).every(Number.isFinite));
  assert.deepEqual(constrainOfficeCamera(anchor, { x: -2, y: 3, z: 4 }, [wall]), { x: -2, y: 3, z: 4 });
});

test('the real archive shelves obstruct the follow camera and all work destinations can be reached closely', () => {
  const hall = buildGuildhallScene(THREE);
  try {
    const anchor = { x: -12.6, y: 1.12, z: -7.7 };
    const camera = constrainOfficeCamera(anchor, { x: -12.6, y: 2.9, z: -11 }, hall.colliders);
    assert.ok(camera.z > -8.495, 'camera crossed the front of the expanded bookcase bounds');
    const archive = hall.interactables.find(place => place.id === 'archive');
    assert.deepEqual(archive.focus, { x: -10, z: -5.8 });
    assert.equal(officeArrivalReady({ x: -8.54, z: -2.28 }, archive.position), false, 'previous prematurely opened position must be rejected');
    for (const place of hall.interactables) {
      let point = { ...OFFICE_SPAWN };
      const path = findOfficePath(point, place.position, hall.colliders);
      assert.ok(path.length);
      for (let tick = 0; tick < 1600 && !officeArrivalReady(point, place.position); tick++) {
        const target = path[0];
        assert.ok(target, 'navigation stopped before reaching ' + place.id);
        const distance = officeDistance(point, target);
        if (distance < .14) { path.shift(); continue; }
        const step = Math.min(distance, 3.1 / 60);
        point = moveOfficeActor(point, { x: (target.x - point.x) / distance * step, z: (target.z - point.z) / distance * step }, hall.colliders);
      }
      assert.ok(officeArrivalReady(point, place.position), 'did not arrive at ' + place.id);
      assert.ok(officeDistance(point, place.position) <= .18);
    }
    assert.equal(officeArrivalReady({ x: NaN, z: 0 }, archive.position), false);
    assert.equal(officeArrivalReady(OFFICE_SPAWN, null), false);
  } finally { hall.dispose(); }
});
