import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmCohortAudit, renderRealmCohortArtifacts } from '../scripts/lib/realm-cohort-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 13 verifies named cohort enforcement, redaction, ERP fallback and privacy', () => {
  const result = buildRealmCohortAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.rosterHiddenFromNonDirectors, true);
  assert.equal(result.summary.aggregateOnly, true);
  assert.equal(result.summary.performanceTracking, false);
  assert.equal(result.summary.durationTracking, false);
});

test('Phase 13 artifacts are deterministic and document a small named pilot', () => {
  const result = buildRealmCohortAudit(root);
  const first = renderRealmCohortArtifacts(result);
  assert.deepEqual(first, renderRealmCohortArtifacts(result));
  assert.match(first['PHASE-13-REPORT.md'], /3–8 nhân sự/);
  assert.match(first['PHASE-13-REPORT.md'], /không tự bật policy/i);
});
