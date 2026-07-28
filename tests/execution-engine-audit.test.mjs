import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildExecutionEngineAudit, renderExecutionEngineArtifacts } from '../scripts/lib/execution-engine-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 1 audit verifies one Task store, execution invariants and anti-ranking policy', () => {
  const result = buildExecutionEngineAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.canonicalTaskStores, 1);
  assert.equal(result.summary.managerActions, 6);
  assert.equal(result.summary.employeeRankingEnabled, false);
  assert.equal(result.summary.migrationAppliedByAudit, false);
});

test('Phase 1 artifacts are deterministic', () => {
  const artifacts = renderExecutionEngineArtifacts(buildExecutionEngineAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'execution-engine', name), 'utf8'), content, name);
  }
});
