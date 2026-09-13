import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createOfficeAvatar } from '../components/realm/three/officeAvatar.js';

test('avatar profile updates preserve skin, bounded dimensions and textured clothing', () => {
  const avatar = createOfficeAvatar(THREE, { color: '#456789', skinColor: '#bf8c67', scale: 1.4 });
  try {
    const bounds = new THREE.Box3().setFromObject(avatar.group);
    assert.ok(bounds.min.y >= -.00001);
    assert.ok(bounds.max.y <= avatar.height);
    assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) <= avatar.radius);
    const materials = new Map();
    avatar.group.traverse(object => { if (object.isMesh) materials.set(object.material.name, object.material); });
    avatar.setColor('#91abce');
    assert.equal(materials.get('Brushed wool').color.getHexString(), '91abce');
    assert.equal(materials.get('Wool mantle').color.getHexString(), '91abce');
    assert.equal(materials.get('Skin').color.getHexString(), 'bf8c67');
    assert.ok(materials.get('Brushed wool').map.isDataTexture);
    avatar.setColor('url(https://invalid.example)');
    assert.equal(materials.get('Brushed wool').color.getHexString(), '456789');
  } finally { avatar.dispose(); }
});

test('walking feet remain level, clear the floor and settle after movement ends', () => {
  const avatar = createOfficeAvatar(THREE);
  try {
    let maximumLift = 0;
    for (let frame = 0; frame < 420; frame += 1) {
      const moving = frame < 240;
      avatar.update(1 / 60, { moving, speed: frame < 120 ? 3.1 : 5 });
      avatar.group.updateMatrixWorld(true);
      for (const side of [-1, 1]) {
        const foot = avatar.group.getObjectByName(`Officer ankle ${side}`);
        const sole = new THREE.Box3().setFromObject(foot).min.y;
        const rotation = foot.getWorldQuaternion(new THREE.Quaternion());
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
        assert.ok(sole >= -.00001, `Foot penetrates the floor at frame ${frame}`);
        assert.ok(sole <= .091);
        assert.ok(up.y > .99999, `Foot tilts at frame ${frame}`);
        assert.ok(avatar.group.getObjectByName(`Officer knee ${side}`).rotation.x <= 0);
        maximumLift = Math.max(maximumLift, sole);
        if (frame > 400) assert.ok(sole < .002, 'Stopped feet should settle to the floor');
      }
    }
    assert.ok(maximumLift > .08, 'Swinging feet should clear the floor');
    for (const delta of [NaN, Infinity, -1, 0, 500]) avatar.update(delta, { moving: true, speed: NaN, time: Infinity });
    avatar.group.traverse(object => assert.ok([...object.position, ...object.quaternion].every(Number.isFinite)));
  } finally { avatar.dispose(); }
});

test('avatar teardown disposes shared geometry, materials and textures exactly once', () => {
  const avatar = createOfficeAvatar(THREE), resources = new Set(), disposal = new Map();
  let meshes = 0;
  avatar.group.traverse(object => {
    if (!object.isMesh) return;
    meshes += 1; resources.add(object.geometry); resources.add(object.material);
    for (const key of ['map', 'bumpMap']) if (object.material[key]) resources.add(object.material[key]);
  });
  assert.ok(meshes < 40, 'Detail should remain batched for a populated office');
  for (const resource of resources) resource.addEventListener('dispose', () => disposal.set(resource, (disposal.get(resource) || 0) + 1));
  avatar.dispose(); avatar.dispose(); avatar.update(1, { moving: true });
  assert.equal(avatar.group.children.length, 0);
  for (const resource of resources) assert.equal(disposal.get(resource), 1);
});
