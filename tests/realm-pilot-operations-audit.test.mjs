import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotOperationsAudit, renderRealmPilotOperationsArtifacts } from '../scripts/lib/realm-pilot-operations-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 16 audit verifies every rollout, privacy, rollback and mobile contract', () => {
  const result = buildRealmPilotOperationsAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.rosterIncluded, false);
  assert.equal(result.summary.selfApprovalAllowed, false);
  assert.equal(result.summary.pausePreservesData, true);
});

test('Phase 16 audit artifacts are deterministic and describe the 7–14 day gate', () => {
  const result = buildRealmPilotOperationsAudit(root);
  const artifacts = renderRealmPilotOperationsArtifacts(result);
  assert.deepEqual(Object.keys(artifacts).sort(), ['PHASE-16-REPORT.md', 'pilot-operations-contracts.csv', 'pilot-operations-verification.json']);
  assert.match(artifacts['PHASE-16-REPORT.md'], /Observation window: \*\*7–14 ngày\*\*/);
  assert.match(artifacts['pilot-operations-contracts.csv'], /pause-uses-existing-kill-switch/);
  assert.equal(JSON.parse(artifacts['pilot-operations-verification.json']).summary.aggregateOnly, true);
});
