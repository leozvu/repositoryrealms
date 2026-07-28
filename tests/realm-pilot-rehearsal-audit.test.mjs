import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotRehearsalAudit, renderRealmPilotRehearsalArtifacts } from '../scripts/lib/realm-pilot-rehearsal-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 17 audit verifies evidence, four-eyes, expiry, privacy and wave integration', () => {
  const result = buildRealmPilotRehearsalAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.sealTtlHours, 24);
  assert.equal(result.summary.rosterIncluded, false);
  assert.equal(result.summary.selfApprovalAllowed, false);
  assert.equal(result.summary.waveRequiresSeal, true);
  assert.equal(result.summary.policyMutationFromRemediation, false);
});

test('Phase 17 audit artifacts are deterministic and describe the sealed rehearsal gate', () => {
  const result = buildRealmPilotRehearsalAudit(root);
  const artifacts = renderRealmPilotRehearsalArtifacts(result);
  assert.deepEqual(Object.keys(artifacts).sort(), ['PHASE-17-REPORT.md', 'pilot-rehearsal-contracts.csv', 'pilot-rehearsal-verification.json']);
  assert.match(artifacts['PHASE-17-REPORT.md'], /Sealed evidence TTL: \*\*24 giờ\*\*/);
  assert.match(artifacts['pilot-rehearsal-contracts.csv'], /wave-activation-rechecks-seal/);
  assert.equal(JSON.parse(artifacts['pilot-rehearsal-verification.json']).summary.aggregateOnly, true);
});
