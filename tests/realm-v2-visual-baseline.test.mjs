import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  aggregatePhaseScore,
  PHASE_0_AREAS,
  PHASE_0_BREAKPOINTS,
  PHASE_0_SCORE_WEIGHTS,
  weightedAreaScore,
} from '../qa/realm-v2-visual-baseline/phase-0-config.mjs';

test('Phase 0 locks an 18 by 5 visual evidence matrix', () => {
  assert.equal(PHASE_0_AREAS.length, 18);
  assert.equal(PHASE_0_BREAKPOINTS.length, 5);
  assert.equal(PHASE_0_AREAS.length * PHASE_0_BREAKPOINTS.length, 90);
  assert.equal(new Set(PHASE_0_AREAS.map((area) => area.slug)).size, 18);
  assert.equal(new Set(PHASE_0_BREAKPOINTS.map((item) => item.width)).size, 5);
});

test('Phase 0 score rubric is bounded, weighted and below the 95 release gate', () => {
  assert.equal(Object.values(PHASE_0_SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
  for (const area of PHASE_0_AREAS) {
    assert.ok(weightedAreaScore(area) >= 0 && weightedAreaScore(area) <= 100);
    assert.ok(area.implementation.startsWith('Partial'));
    assert.match(area.canonicalData, /^Yes/);
  }
  assert.ok(aggregatePhaseScore() < 95);
});

test('coverage documentation distinguishes the Phase 0 baseline from Phase 1–8 product compositions', () => {
  const matrix = fs.readFileSync(path.resolve('docs/realms/design-system/REALM-DESIGN-COVERAGE-MATRIX.md'), 'utf8');
  assert.match(matrix, /Design complete \/ Phase 1–8 product compositions complete for all 18 registered areas/);
  assert.match(matrix, /historical Phase 0 baseline/);
  assert.match(matrix, /All 18 `\/realm-v2\/<area>` entries listed as direct in the matrix are authenticated Realm product compositions/);
  for (const column of ['Implementation', 'Canonical data', 'Visual score', 'Responsive score']) assert.match(matrix, new RegExp(column));
  assert.doesNotMatch(matrix, /Status: complete for product design v1/);
});

test('reference lock contains the fourteen approved visual boards', () => {
  const lock = JSON.parse(fs.readFileSync(path.resolve('qa/realm-v2-visual-baseline/reference-lock.json'), 'utf8'));
  assert.equal(lock.assets.length, 14);
  assert.equal(lock.algorithm, 'sha256');
  assert.equal(lock.width, 1536);
  assert.equal(lock.height, 1024);
  for (const asset of lock.assets) assert.match(asset.sha256, /^[a-f0-9]{64}$/);
});
