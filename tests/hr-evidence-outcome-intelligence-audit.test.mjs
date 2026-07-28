import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildHrEvidenceOutcomeIntelligenceAudit,
  renderHrEvidenceOutcomeIntelligenceArtifacts,
} from '../scripts/lib/hr-evidence-outcome-intelligence-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 6 audit verifies evidence layers, minimum scope and no-auto-HR policy', () => {
  const result = buildHrEvidenceOutcomeIntelligenceAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.canonicalStores, 7);
  assert.equal(result.summary.evidenceLayers, 4);
  assert.equal(result.summary.compositePerformanceScoreEnabled, false);
  assert.equal(result.summary.employeeRankingEnabled, false);
  assert.equal(result.summary.automaticHrDecisionEnabled, false);
  assert.equal(result.summary.phase0LedgerReadEnabled, false);
  assert.equal(result.summary.schemaMigrationRequired, false);
});
test('Phase 6 audit artifacts are deterministic', () => {
  const artifacts = renderHrEvidenceOutcomeIntelligenceArtifacts(buildHrEvidenceOutcomeIntelligenceAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'hr-evidence-outcome-intelligence', name), 'utf8'), content, name);
  }
});
