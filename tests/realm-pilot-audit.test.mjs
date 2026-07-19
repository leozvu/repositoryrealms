import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotAudit, renderRealmPilotArtifacts } from '../scripts/lib/realm-pilot-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 10 verifies rollout, server enforcement, opt-out, privacy and additive data contracts', () => {
  const result = buildRealmPilotAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.additiveMigrations, 1);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.performanceTracking, false);
});

test('Phase 10 artifacts are deterministic and state the ERP fallback contract', () => {
  const result = buildRealmPilotAudit(root);
  const first = renderRealmPilotArtifacts(result);
  assert.deepEqual(first, renderRealmPilotArtifacts(result));
  assert.match(first['PHASE-10-REPORT.md'], /ERP luôn là fallback/);
  assert.match(first['PHASE-10-REPORT.md'], /Không ghi thời lượng hoặc hiệu suất cá nhân/);
});
