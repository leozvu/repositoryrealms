import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotActivationAudit, renderRealmPilotActivationArtifacts } from '../scripts/lib/realm-pilot-activation-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 18 audit verifies canary, privacy, fail-closed and rollback contracts', () => {
  const result = buildRealmPilotActivationAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.canaryWindowMinutes, 90);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.aggregateOnly, true);
  assert.equal(result.summary.automaticCohortExpansion, false);
  assert.equal(result.summary.rollbackAlwaysAvailable, true);
});

test('Phase 18 audit artifacts are deterministic and document the activation gate', () => {
  const result = buildRealmPilotActivationAudit(root);
  const artifacts = renderRealmPilotActivationArtifacts(result);
  assert.deepEqual(Object.keys(artifacts).sort(), ['PHASE-18-REPORT.md', 'pilot-activation-contracts.csv', 'pilot-activation-verification.json']);
  assert.match(artifacts['PHASE-18-REPORT.md'], /Canary window: \*\*90 phút\*\*/);
  assert.match(artifacts['pilot-activation-contracts.csv'], /rollback-reuses-kill-switch/);
  assert.equal(JSON.parse(artifacts['pilot-activation-verification.json']).summary.automaticCohortExpansion, false);
});
