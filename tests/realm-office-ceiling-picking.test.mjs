import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildGuildhallScene } from '../components/realm/three/guildhallScene.js';

test('overview ray reaches the project workstation through the lifted ceiling after camera mode changes', () => {
  const hall = buildGuildhallScene(THREE);
  try {
    const ceiling = hall.group.getObjectByName('Guildhall overhead structure');
    const origin = new THREE.Vector3(0, 22, 22);
    const direction = new THREE.Vector3(0, 1, 0).sub(origin).normalize();
    const ray = new THREE.Raycaster(origin, direction);
    for (const previousMode of ['follow', 'first']) {
      hall.setCameraMode(previousMode);
      assert.equal(ceiling.visible, true);
      hall.setCameraMode('overview');
      assert.equal(ceiling.visible, false);
      hall.group.updateMatrixWorld(true);
      const hits = ray.intersectObject(hall.group, true);
      assert.equal(hits[0]?.object.userData.interactableId, 'project-table');
      assert.equal(hits[0].object.material.visible, false, 'non-rendering workstation hit volumes must remain pickable');

      // This real camera ray crosses overhead geometry before the desk. Merely
      // setting ceiling.visible=false previously left that geometry as hit #1.
      const overheadHits = [];
      ceiling.traverse(object => {
        if (object.isMesh) THREE.Mesh.prototype.raycast.call(object, ray, overheadHits);
      });
      assert.ok(overheadHits.some(hit => hit.distance < hits[0].distance), 'the regression path must actually cross a ceiling surface');
    }
  } finally { hall.dispose(); }
});
