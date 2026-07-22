import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotIncidentAudit, renderRealmPilotIncidentArtifacts } from '../scripts/lib/realm-pilot-incident-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 19 audit verifies incident privacy, fail-closed rollback and decision contracts', () => {
  const result = buildRealmPilotIncidentAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.incidentLimit, 40);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.aggregateOnly, true);
  assert.equal(result.summary.automaticReactivation, false);
  assert.equal(result.summary.criticalRollbackAtomic, true);
});

test('Phase 19 audit artifacts are deterministic and document incident command', () => {
  const result = buildRealmPilotIncidentAudit(root);
  const artifacts = renderRealmPilotIncidentArtifacts(result);
  assert.deepEqual(Object.keys(artifacts).sort(), ['PHASE-19-REPORT.md', 'pilot-incident-contracts.csv', 'pilot-incident-verification.json']);
  assert.match(artifacts['PHASE-19-REPORT.md'], /Automatic reactivation: \*\*false\*\*/);
  assert.match(artifacts['pilot-incident-contracts.csv'], /critical-atomic-kill-switch/);
  assert.equal(JSON.parse(artifacts['pilot-incident-verification.json']).summary.criticalRollbackAtomic, true);
});
