import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildRepositoryRealmsParityAudit,
  renderRepositoryRealmsParityArtifacts,
} from '../scripts/lib/repository-realms-parity-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 21 audit measures RepositoryRealms invariants and explicitly rejects button parity', () => {
  const result = buildRepositoryRealmsParityAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.registeredBusinessActions, 18);
  assert.equal(result.summary.buttonParityRequired, false);
  assert.equal(result.summary.businessInvariantParityRequired, true);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
});

test('Phase 21 parity artifacts are deterministic', () => {
  const artifacts = renderRepositoryRealmsParityArtifacts(buildRepositoryRealmsParityAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'repository-realms-parity', name), 'utf8'), content, name);
  }
});
