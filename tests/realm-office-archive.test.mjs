import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMedievalArchive } from '../components/realm/three/medievalArchive.js';
import { buildGuildhallScene } from '../components/realm/three/guildhallScene.js';

function fixture() {
  const group = new THREE.Group(), geometries = new Set(), materials = new Set(), colliders = [];
  const material = new THREE.MeshStandardMaterial(); materials.add(material);
  const kit = buildMedievalArchive(THREE, { group, floorY: .02145,
    materials: new Proxy({}, { get: () => material }),
    ownGeometry(value) { geometries.add(value); return value; },
    ownMaterial(value) { materials.add(value); return value; },
    obstacle: (...args) => colliders.push(args),
  });
  group.updateMatrixWorld(true);
  return { group, kit, geometries, materials, colliders,
    dispose() { geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); } };
}

test('archive cabinetry stays on the floor and within the existing navigation/camera envelope', () => {
  const f = fixture();
  try {
    assert.equal(f.kit.cabinets.length, 3);
    for (const [index, cabinet] of f.kit.cabinets.entries()) {
      const bounds = new THREE.Box3().setFromObject(cabinet);
      const [, x, z, width, depth, cameraHeight] = f.colliders[index];
      assert.ok(Math.abs(bounds.min.y - .02145) < .0001);
      assert.ok(Math.abs(bounds.max.y - .02145 - f.kit.dimensions.cabinetHeight) < .0001);
      assert.ok(bounds.min.x >= x - width / 2 && bounds.max.x <= x + width / 2);
      assert.ok(bounds.min.z >= z - depth / 2 && bounds.max.z <= z + depth / 2);
      assert.ok(bounds.max.y < cameraHeight);
      const shelf = cabinet.getObjectByName('Shelf oak plank'), p = shelf.geometry.attributes.position;
      const uv = shelf.geometry.attributes.uv, n = shelf.geometry.attributes.normal;
      // Long grain must retain metre density in the member's local X axis.
      const top = Array.from({ length: p.count }, (_, i) => i).filter(i => n.getY(i) > .99);
      const worldSpan = Math.max(...top.map(i => p.getX(i))) - Math.min(...top.map(i => p.getX(i)));
      const uvSpan = Math.max(...top.map(i => uv.getX(i))) - Math.min(...top.map(i => uv.getX(i)));
      assert.ok(Math.abs(worldSpan / uvSpan - 1.35) < .0001);
    }
  } finally { f.dispose(); }
});

test('bound volumes have inset paper, closed curved spines and supported upright or stacked poses', () => {
  const f = fixture();
  try {
    assert.equal(f.kit.books.length, 216);
    assert.equal(f.kit.books.filter(book => book.horizontal).length, 36);
    const stackBase = new Map();
    for (const { object, pageBlock, horizontal } of f.kit.books) {
      const { width, height, depth, coverThickness } = object.userData.dimensions;
      pageBlock.geometry.computeBoundingBox();
      const pageSize = pageBlock.geometry.boundingBox.getSize(new THREE.Vector3());
      assert.ok(pageSize.x <= width - 2 * coverThickness);
      assert.ok(pageSize.y < height && pageSize.z < depth);
      assert.ok(object.getObjectByName('Rounded leather spine').geometry.attributes.position.count > 24);
      assert.equal(object.children.filter(part => part.name === 'Raised sewing support').length, 3);
      const bottom = object.position.y - (horizontal ? width : height) / 2;
      const shelfIndex = Math.round((bottom - .235) / .56);
      const shelfY = .235 + shelfIndex * .56;
      if (horizontal) {
        const key = object.parent.uuid + ':' + shelfIndex;
        assert.ok(Math.abs(bottom - (stackBase.get(key) ?? shelfY)) < .00001);
        stackBase.set(key, bottom + width);
      } else assert.ok(Math.abs(bottom - shelfY) < .00001, 'upright volume must rest on its shelf');
    }
    f.group.traverse(object => {
      if (!object.isMesh) return;
      assert.ok(f.geometries.has(object.geometry));
      assert.ok(f.materials.has(object.material));
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
    });
  } finally { f.dispose(); }
});

test('archive detail stays in two book material batches with a bounded triangle increase', () => {
  const hall = buildGuildhallScene(THREE);
  try {
    let triangles = 0;
    const bindingBatches = [], paperBatches = [];
    hall.group.traverse(object => {
      if (!object.isMesh || object.material.visible === false) return;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.count ?? 1);
      if (object.material.name === 'Archive matte leather bindings') bindingBatches.push(object);
      if (object.material.name === 'Archive cut paper and gatherings') paperBatches.push(object);
    });
    assert.equal(bindingBatches.length, 1);
    assert.equal(paperBatches.length, 1);
    assert.ok(triangles < 135_000, `Static scene grew to ${triangles} triangles; baseline before archive was 98,007`);
    assert.equal(hall.archive.volumeCount, 216);
    for (const object of [...bindingBatches, ...paperBatches]) {
      assert.ok(object.geometry.attributes.color);
      assert.ok(object.geometry.boundingSphere && Number.isFinite(object.geometry.boundingSphere.radius));
    }
  } finally { hall.dispose(); }
});
