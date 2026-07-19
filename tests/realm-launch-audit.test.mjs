import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmLaunchAudit, renderRealmLaunchArtifacts } from '../scripts/lib/realm-launch-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 14 controlled launch audit verifies every contract and deterministic scenario', () => {
  const result = buildRealmLaunchAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.aggregateOnly, true);
  assert.equal(result.summary.rosterIncluded, false);
  assert.equal(result.summary.killSwitchRequiresPreview, false);
  assert.equal(result.contracts.every((row) => row.status === 'verified'), true);
  assert.equal(result.scenarios.every((row) => row.status === 'verified'), true);
});

test('Phase 14 audit renders JSON, CSV and human-readable report', () => {
  const artifacts = renderRealmLaunchArtifacts(buildRealmLaunchAudit(root));
  assert.deepEqual(Object.keys(artifacts).sort(), ['PHASE-14-REPORT.md', 'launch-contracts.csv', 'launch-verification.json']);
  assert.match(artifacts['PHASE-14-REPORT.md'], /Controlled Pilot Launch/);
  assert.match(artifacts['launch-contracts.csv'], /hmac-signed-short-lived-preview/);
  assert.equal(JSON.parse(artifacts['launch-verification.json']).summary.previewTtlMinutes, 10);
});
