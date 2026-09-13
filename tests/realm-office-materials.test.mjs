import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import sharp from 'sharp';
import { createOfficeMaterialLibrary, projectOfficeUVs, bakeOfficeSurfaceInstances } from '../components/realm/three/officeMaterials.js';
import { createOfficeQuality } from '../components/realm/three/officeQuality.js';

test('bundled material files match their source manifest and decode as finite 1K maps', async () => {
  const base = new URL('../public/realms/assets/materials/pbr-v1/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  for (const asset of manifest.assets) {
    const data = await readFile(new URL(asset.file, base));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256, asset.file);
    const image = await sharp(data).metadata();
    assert.equal(image.format, 'jpeg');
    assert.ok(image.width <= 2048 && image.height <= 2048, asset.file);
    assert.equal(asset.license, 'CC0-1.0');
  }
  assert.ok(manifest.assets.reduce((total, asset) => total + asset.bytes, 0) < 7 * 1024 * 1024);
});

test('UV mapping keeps a physical texture scale after world transforms and batching', () => {
  const wall = new THREE.BoxGeometry(8, 4, .4).toNonIndexed();
  wall.translate(5, 2, -12);
  projectOfficeUVs(wall, 2);
  const uv = wall.attributes.uv, positions = wall.attributes.position, normals = wall.attributes.normal;
  for (let i = 0; i < positions.count; i++) {
    if (normals.getZ(i) > .9) {
      assert.equal(uv.getX(i), positions.getX(i) / 2);
      assert.equal(uv.getY(i), positions.getY(i) / 2);
    }
  }
  wall.dispose();
});

test('full and half planks retain physical grain density, tint, bounds and a shared draw call', () => {
  const source = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const planks = new THREE.InstancedMesh(source, material, 2), transform = new THREE.Object3D();
  for (const [i, width] of [2.54, 1.27].entries()) {
    transform.position.set(i * 3, .075, 0); transform.scale.set(width, .045, .4); transform.updateMatrix();
    planks.setMatrixAt(i, transform.matrix); planks.setColorAt(i, new THREE.Color(i ? '#777777' : '#bbbbbb'));
  }
  planks.scale.y = .78; planks.updateMatrixWorld(true);
  const geometry = bakeOfficeSurfaceInstances(THREE, planks, 2.6);
  try {
    assert.equal(geometry.attributes.position.count, 72);
    assert.ok(geometry.boundingSphere.radius < 4);
    for (const [piece, width] of [2.54, 1.27].entries()) {
      const top = [];
      for (let i = piece * 36; i < (piece + 1) * 36; i++) if (geometry.attributes.normal.getY(i) > .99) top.push(i);
      const span = axis => Math.max(...top.map(i => geometry.attributes.uv[axis](i))) - Math.min(...top.map(i => geometry.attributes.uv[axis](i)));
      assert.ok(Math.abs(span('getX') - width / 2.6) < 1e-6);
      assert.ok(Math.abs(span('getY') - .4 / 2.6) < 1e-6);
      assert.ok(top.every(i => Math.abs(geometry.attributes.position.getY(i) - .0975 * .78) < 1e-6));
    }
    assert.ok(geometry.attributes.color.getX(0) > geometry.attributes.color.getX(36));
    assert.equal(source.attributes.position.count, 24, 'shared source geometry is not mutated');
  } finally { geometry.dispose(); source.dispose(); material.dispose(); }
});

test('textures finish loading into the same objects after switching to light graphics, and failures retain a fallback', async () => {
  const oldDocument = globalThis.document, requests = [];
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  class Loader { load(url, done, progress, fail) { requests.push({ url, done, fail }); } }
  const library = createOfficeMaterialLibrary({ ...THREE, TextureLoader: Loader });
  const material = new THREE.MeshStandardMaterial(library.maps('oak'));
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  const quality = createOfficeQuality(scene);
  try {
    quality.setMode('balanced');
    const sharedMap = mesh.material.map;
    assert.equal(sharedMap, material.map);
    assert.equal(material.normalMap.colorSpace, THREE.NoColorSpace);
    assert.equal(material.map.colorSpace, THREE.SRGBColorSpace);
    let allocationReleased = false;
    material.map.addEventListener('dispose', () => { allocationReleased = true; });
    const nextImage = { width: 1024, height: 1024 };
    requests[0].done(new THREE.Texture(nextImage));
    requests[1].fail(); requests[2].done(new THREE.Texture(nextImage));
    assert.deepEqual(await library.ready(), { loaded: 2, failed: 1 });
    assert.equal(sharedMap.image, nextImage);
    assert.equal(allocationReleased, true, 'a 2px immutable GPU allocation must be released before the 1K upload');
    assert.ok(material.normalMap.image, 'the normal fallback remains available');
    quality.setMode('high'); assert.equal(mesh.material, material);
  } finally { quality.dispose(); library.dispose(); material.dispose(); geometry.dispose(); globalThis.document = oldDocument; }
});

test('late texture callbacks cannot revive resources after leaving the 3D office', async () => {
  const oldDocument = globalThis.document, requests = [];
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
  class Loader { load(url, done) { requests.push(done); } }
  const library = createOfficeMaterialLibrary({ ...THREE, TextureLoader: Loader });
  try {
    const maps = library.maps('mineral'), fallback = maps.map.image;
    let disposed = 0;
    maps.map.addEventListener('dispose', () => disposed++);
    library.dispose(); library.dispose();
    requests.forEach(done => done(new THREE.Texture({ width: 1024, height: 1024 })));
    await library.ready();
    assert.equal(maps.map.image, fallback); assert.equal(disposed, 1);
  } finally { library.dispose(); globalThis.document = oldDocument; }
});
