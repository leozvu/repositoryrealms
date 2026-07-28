import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmChangeFeedAudit, renderRealmChangeFeedArtifacts } from '../scripts/lib/realm-change-feed-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 3 change-feed audit verifies all contracts and scenarios', () => {
  const result = buildRealmChangeFeedAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
});

test('Phase 3 artifacts are deterministic and document privacy boundary', () => {
  const result = buildRealmChangeFeedAudit(root);
  const first = renderRealmChangeFeedArtifacts(result);
  const second = renderRealmChangeFeedArtifacts(result);
  assert.deepEqual(first, second);
  assert.match(first['PHASE-3-REPORT.md'], /không trả entity ID, actor ID/);
});
