import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmReleaseCandidateAudit, renderRealmReleaseCandidateArtifacts } from '../scripts/lib/realm-release-candidate-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 24 audit verifies integrity, governance, privacy, UX and authentication contracts', () => {
  const result = buildRealmReleaseCandidateAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.evidenceSources, 5);
  assert.equal(result.summary.deterministicDigest, true);
  assert.equal(result.summary.authoritativeLaunchGate, false);
  assert.equal(result.summary.aggregateOnly, true);
  assert.equal(result.summary.userIdsIncluded, false);
  assert.equal(result.summary.businessRecordIdsIncluded, false);
  assert.equal(result.summary.additiveMigrations, 0);
});

test('Phase 24 release candidate audit artifacts are deterministic', () => {
  const artifacts = renderRealmReleaseCandidateArtifacts(buildRealmReleaseCandidateAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'realm-release-candidate', name), 'utf8'), content, name);
  }
});
