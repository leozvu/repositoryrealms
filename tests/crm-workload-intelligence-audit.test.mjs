import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCrmWorkloadIntelligenceAudit, renderCrmWorkloadIntelligenceArtifacts } from '../scripts/lib/crm-workload-intelligence-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 4 audit verifies canonical CRM workload, provenance and anti-ranking policy', () => {
  const result = buildCrmWorkloadIntelligenceAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.canonicalLeadStores, 1);
  assert.equal(result.summary.canonicalActivityStores, 1);
  assert.equal(result.summary.confidenceCeiling, 'medium');
  assert.equal(result.summary.employeeRankingEnabled, false);
  assert.equal(result.summary.automaticLeadMutationEnabled, false);
  assert.equal(result.summary.schemaMigrationRequired, false);
});

test('Phase 4 audit artifacts are deterministic', () => {
  const artifacts = renderCrmWorkloadIntelligenceArtifacts(buildCrmWorkloadIntelligenceAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'crm-workload-intelligence', name), 'utf8'), content, name);
  }
});
