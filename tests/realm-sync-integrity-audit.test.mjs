import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmSyncIntegrityAudit, renderRealmSyncIntegrityArtifacts } from '../scripts/lib/realm-sync-integrity-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 6 audit xác minh toàn bộ sync và recovery contracts', () => {
  const result = buildRealmSyncIntegrityAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
});

test('Phase 6 artifacts deterministic', () => {
  const first = renderRealmSyncIntegrityArtifacts(buildRealmSyncIntegrityAudit(root));
  const second = renderRealmSyncIntegrityArtifacts(buildRealmSyncIntegrityAudit(root));
  assert.deepEqual(second, first);
});
