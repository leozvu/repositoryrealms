import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildGuildhallScene } from '../components/realm/three/guildhallScene.js';
import { buildMedievalWorkBay } from '../components/realm/three/medievalWorkBay.js';
import { OFFICE_SPAWN, OFFICE_PORTALS, officeWalkable, findOfficePath, officeSegmentClear } from '../lib/realm-office-3d.js';

test('the constructed hall keeps all work areas mutually reachable around actual furniture', () => {
  const hall = buildGuildhallScene(THREE);
  try {
    assert.deepEqual(hall.interactables.map(item => item.id).sort(), Object.keys(OFFICE_PORTALS).sort());
    const points = [OFFICE_SPAWN, ...hall.interactables.map(item => item.position)];
    for (const point of points) assert.equal(officeWalkable(point, hall.colliders), true);
    for (const start of points) for (const destination of points) {
      const path = findOfficePath(start, destination, hall.colliders);
      assert.ok(path.length, `No path from ${JSON.stringify(start)} to ${JSON.stringify(destination)}`);
      let previous = start;
      for (const point of path) { assert.equal(officeSegmentClear(previous, point, hall.colliders), true); previous = point; }
    }
  } finally { hall.dispose(); }
});

test('all eight workspace objects have raycast targets without visible proxy surfaces', () => {
  const hall = buildGuildhallScene(THREE);
  try {
    hall.group.updateMatrixWorld(true);
    const ids = new Set();
    for (const object of hall.pickables) {
      assert.equal(object.material.visible, false);
      const box = new THREE.Box3().setFromObject(object), center = box.getCenter(new THREE.Vector3());
      const ray = new THREE.Raycaster(new THREE.Vector3(center.x, box.max.y + 1, center.z), new THREE.Vector3(0, -1, 0));
      assert.ok(ray.intersectObject(object).length);
      ids.add(object.userData.interactableId);
    }
    assert.deepEqual([...ids].sort(), Object.keys(OFFICE_PORTALS).sort());
  } finally { hall.dispose(); }
});

test('the new desk keeps metric height through batching and window rays reach outside through masonry', () => {
  const hall = buildGuildhallScene(THREE);
  try {
    hall.group.updateMatrixWorld(true);
    // This point misses the ledger and props, measuring the actual batched top.
    const ray = new THREE.Raycaster(new THREE.Vector3(-10.8, 1.5, -5.55), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(hall.group, true).filter(hit => hit.object.material.visible !== false);
    const floorRay = new THREE.Raycaster(new THREE.Vector3(-10.8, .12, -5.55), new THREE.Vector3(0, -1, 0));
    const floorHits = floorRay.intersectObject(hall.group, true).filter(hit => hit.object.name === 'Metric flagstone floor');
    assert.ok(Math.abs(hits[0].point.y - floorHits[0].point.y - .75) < .005, 'desk must be 75 cm above its actual stone floor');
    const windowRay = new THREE.Raycaster(new THREE.Vector3(.36, 2.75, -10.7), new THREE.Vector3(0, 0, -1), 0, 3);
    const windowHits = windowRay.intersectObject(hall.group, true).filter(hit => hit.object.material.visible !== false);
    assert.ok(windowHits.some(hit => hit.object.material.transparent), 'the ray must cross real glazing');
    assert.equal(windowHits.some(hit => !hit.object.material.transparent), false, 'opaque masonry still blocks the aperture');
    const wallRay = new THREE.Raycaster(new THREE.Vector3(3.2, 2.75, -10.7), new THREE.Vector3(0, 0, -1), 0, 3);
    assert.ok(wallRay.intersectObject(hall.group, true).some(hit => !hit.object.material.transparent), 'masonry next to the aperture must remain solid');
  } finally { hall.dispose(); }
});

test('authored furniture has correct dimensions, a usable knee space and owned finite geometry', () => {
  const group = new THREE.Group(), geometries = new Set(), colliders = [];
  const material = new THREE.MeshStandardMaterial();
  const materials = new Proxy({}, { get: () => material });
  try {
    const kit = buildMedievalWorkBay(THREE, { materials, group, floorY: .02145, ownGeometry: value => { geometries.add(value); return value; }, obstacle: (...args) => colliders.push(args) });
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(kit.desk);
    assert.ok(Math.abs(bounds.max.y - .77145) < .001);
    assert.ok(Math.abs(bounds.max.x - bounds.min.x - 2.199) < .005);
    const cushion = group.getObjectByName('Writing chair cushion');
    assert.ok(Math.abs(new THREE.Box3().setFromObject(cushion).max.y - .49845) < .001);
    // Central knees can move under the front apron without hitting a box slab.
    const knees = new THREE.Raycaster(new THREE.Vector3(-10, .56645, -5.25), new THREE.Vector3(0, 0, -1), 0, .65);
    assert.equal(knees.intersectObject(kit.desk, true).length, 0);
    group.traverse(object => {
      if (!object.isMesh) return;
      assert.ok(geometries.has(object.geometry));
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
    });
    assert.ok(colliders.some(([name]) => name === 'archive-reading-table'));
  } finally { geometries.forEach(geometry => geometry.dispose()); material.dispose(); }
});
