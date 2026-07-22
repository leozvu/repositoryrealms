import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmReadinessAudit, renderRealmReadinessArtifacts } from '../scripts/lib/realm-readiness-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 12 verifies release controls, server flags, safe rollback, privacy and onboarding', () => {
  const result = buildRealmReadinessAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.aggregateOnly, true);
  assert.equal(result.summary.performanceTracking, false);
  assert.equal(result.summary.durationTracking, false);
});

test('Phase 12 artifacts are deterministic and document policy-only rollback', () => {
  const result = buildRealmReadinessAudit(root);
  const first = renderRealmReadinessArtifacts(result);
  assert.deepEqual(first, renderRealmReadinessArtifacts(result));
  assert.match(first['PHASE-12-REPORT.md'], /không đảo migration/i);
  assert.match(first['PHASE-12-REPORT.md'], /không gửi tiến độ lên server/i);
});
