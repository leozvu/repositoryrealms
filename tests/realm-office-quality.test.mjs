import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOfficeQuality, officePixelRatio, createOfficeFrameBudget, nextOfficeRenderBudget, officeResolutionFloor } from '../components/realm/three/officeQuality.js';

test('light graphics preserves colors, transparent surfaces and instancing, and restores original PBR', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial({ color: '#315d4d', transparent: true, opacity: .4, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const instances = new THREE.InstancedMesh(mesh.geometry, material, 4);
  scene.add(mesh, instances);
  const quality = createOfficeQuality(scene);
  quality.setMode('balanced');
  assert.ok(mesh.material.isMeshLambertMaterial);
  assert.equal(mesh.material, instances.material);
  assert.equal(mesh.material.side, THREE.DoubleSide);
  assert.equal(mesh.material.opacity, .4);
  material.color.set('#aacc33');
  assert.equal(mesh.material.color.getHexString(), 'aacc33', 'profile colors remain live after switching tiers');
  const newcomer = new THREE.Mesh(mesh.geometry, material); scene.add(newcomer); quality.sync();
  assert.equal(newcomer.material, mesh.material);
  quality.setMode('high'); assert.equal(mesh.material, material); assert.equal(newcomer.material, material);
  quality.dispose(); material.dispose(); mesh.geometry.dispose();
});

test('framebuffer budget bounds pixel work on large displays while preserving mobile density', () => {
  for (const mode of ['balanced', 'high']) {
    const ratio = officePixelRatio({ mode, width: 3840, height: 2160, deviceRatio: 2 });
    assert.ok(3840 * 2160 * ratio ** 2 <= (mode === 'balanced' ? 650000 : 2100000) + 1);
  }
  assert.equal(officePixelRatio({ mode: 'balanced', width: 393, height: 851, deviceRatio: 3 }), 1);
});

test('a single stall does not lower quality; persistent slow rendering does', () => {
  const budget = createOfficeFrameBudget();
  for (const ms of [16, 16, 1000, 16, 16, 16, 16, 16]) assert.equal(budget.sample(ms), false);
  for (let i = 0; i < 7; i++) assert.equal(budget.sample(90), false);
  assert.equal(budget.sample(90), true);
  budget.reset(); assert.equal(budget.sample(16), false);
});

test('sustained load keeps explicitly selected PBR while bounding resolution without lowering the saved tier', () => {
  let state = { mode: 'high', manualHigh: true, scale: 1 };
  for (let i = 0; i < 20; i++) state = { ...state, ...nextOfficeRenderBudget(state) };
  assert.equal(state.mode, 'high');
  assert.equal(state.scale, .55);
  const ratio = officePixelRatio({ mode: state.mode, width: 393, height: 851, deviceRatio: 3, scale: state.scale });
  assert.ok(ratio < 1 && ratio > .8);
  assert.deepEqual(nextOfficeRenderBudget({ mode: 'high', scale: 1 }), { mode: 'balanced', scale: 1 });
  assert.deepEqual(nextOfficeRenderBudget({ mode: 'balanced', scale: .45 }), { mode: 'balanced', scale: .45 });
});

test('two severe stalls trigger recovery promptly while an isolated compilation spike is ignored', () => {
  const budget = createOfficeFrameBudget();
  assert.equal(budget.sample(4000), false);
  assert.equal(budget.sample(16), false);
  assert.equal(budget.sample(3500), false);
  assert.equal(budget.sample(3200), true);
  assert.deepEqual(nextOfficeRenderBudget({ mode: 'high', manualHigh: true, scale: 1, urgent: true }), { mode: 'high', scale: .55 });
  budget.reset();
  assert.equal(budget.sample(16), false);
});

test('clarity preference maintains its floor under sustained load without changing material choice', () => {
  for (const mode of ['high', 'balanced']) {
    let state = { mode, manualHigh: true, preference: 'clarity', scale: 1, urgent: true };
    for (let i = 0; i < 20; i++) state = { ...state, ...nextOfficeRenderBudget(state) };
    assert.equal(state.scale, .75);
    assert.equal(state.mode, mode);
  }
  assert.equal(officeResolutionFloor('high', 'auto'), .55);
  assert.equal(officeResolutionFloor('balanced', 'auto'), .45);
});

test('resolution recovery needs sustained headroom and never counts a paused backdrop as headroom', () => {
  const budget = createOfficeFrameBudget();
  for (let i = 0; i < 374; i++) budget.sample(16);
  assert.equal(budget.takeRecovery(), false);
  budget.sample(16); assert.equal(budget.takeRecovery(), true);
  assert.equal(budget.takeRecovery(), false, 'one recovery signal cannot be consumed twice');
  for (let i = 0; i < 374; i++) budget.sample(16);
  budget.sample(200);
  assert.equal(budget.takeRecovery(), false);
  budget.reset();
  for (let i = 0; i < 374; i++) budget.sample(16);
  assert.equal(budget.takeRecovery(), false);
});
