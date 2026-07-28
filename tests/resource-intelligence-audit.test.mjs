import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildResourceIntelligenceAudit, renderResourceIntelligenceArtifacts } from '../scripts/lib/resource-intelligence-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 2 audit verifies source separation, canonical estimate action and anti-ranking policy', () => {
  const result = buildResourceIntelligenceAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.canonicalTaskStores, 1);
  assert.equal(result.summary.canonicalEstimateActions, 1);
  assert.equal(result.summary.confidenceCeiling, 'medium');
  assert.equal(result.summary.employeeRankingEnabled, false);
  assert.equal(result.summary.migrationAppliedByAudit, false);
});

test('Phase 2 artifacts are deterministic', () => {
  const artifacts = renderResourceIntelligenceArtifacts(buildResourceIntelligenceAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'resource-intelligence', name), 'utf8'), content, name);
  }
});
