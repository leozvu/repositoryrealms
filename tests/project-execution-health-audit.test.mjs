import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildProjectExecutionHealthAudit, renderProjectExecutionHealthArtifacts } from '../scripts/lib/project-execution-health-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 3 audit verifies canonical Project health, provenance and anti-ranking policy', () => {
  const result = buildProjectExecutionHealthAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.canonicalProjectStores, 1);
  assert.equal(result.summary.confidenceCeiling, 'medium');
  assert.equal(result.summary.employeeRankingEnabled, false);
  assert.equal(result.summary.accountingProfitClaimed, false);
  assert.equal(result.summary.schemaMigrationRequired, false);
});

test('Phase 3 audit artifacts are deterministic', () => {
  const artifacts = renderProjectExecutionHealthArtifacts(buildProjectExecutionHealthAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'project-execution-health', name), 'utf8'), content, name);
  }
});
