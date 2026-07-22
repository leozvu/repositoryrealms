import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFinancialOperatingIntelligenceAudit, renderFinancialOperatingIntelligenceArtifacts } from '../scripts/lib/financial-operating-intelligence-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 5 audit verifies canonical finance, provenance and no-auto-money policy', () => {
  const result = buildFinancialOperatingIntelligenceAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.canonicalFinanceStores, 5);
  assert.equal(result.summary.confidenceCeiling, 'low');
  assert.equal(result.summary.accountingProfitClaimed, false);
  assert.equal(result.summary.employeeRankingEnabled, false);
  assert.equal(result.summary.automaticMoneyActionEnabled, false);
  assert.equal(result.summary.schemaMigrationRequired, false);
});

test('Phase 5 audit artifacts are deterministic', () => {
  const artifacts = renderFinancialOperatingIntelligenceArtifacts(buildFinancialOperatingIntelligenceAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'financial-operating-intelligence', name), 'utf8'), content, name);
  }
});
