import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmChaosAudit, renderRealmChaosArtifacts } from '../scripts/lib/realm-chaos-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 20 audit verifies every graceful degradation contract and fault scenario', () => {
  const result = buildRealmChaosAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, 7);
  assert.equal(result.summary.scenarios, 7);
  assert.equal(result.summary.automaticWriteRetry, false);
  assert.equal(result.summary.notificationAfterCommit, true);
  assert.equal(result.summary.boundedReconnect, true);
  assert.equal(result.summary.aggregateOnly, true);
  assert.equal(result.summary.additiveMigrations, 0);
});
test('Phase 20 chaos artifacts are deterministic', () => {
  const artifacts = renderRealmChaosArtifacts(buildRealmChaosAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'realm-chaos', name), 'utf8'), content, name);
  }
});
