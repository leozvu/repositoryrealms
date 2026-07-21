import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmExperienceAudit, renderRealmExperienceArtifacts } from '../scripts/lib/realm-experience-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 22 and 23 audit verifies UX, privacy and pilot governance contracts', () => {
  const result = buildRealmExperienceAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedJourneys, 4);
  assert.equal(result.summary.journeys, 4);
  assert.equal(result.summary.aggregateOnly, true);
  assert.equal(result.summary.authoritativeLaunchGate, false);
  assert.equal(result.summary.recordIdsStored, false);
  assert.equal(result.summary.performanceTracking, false);
  assert.equal(result.summary.additiveMigrations, 0);
});

test('Phase 22 and 23 experience artifacts are deterministic', () => {
  const artifacts = renderRealmExperienceArtifacts(buildRealmExperienceAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'realm-experience', name), 'utf8'), content, name);
  }
});
