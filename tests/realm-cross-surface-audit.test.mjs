import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmCrossSurfaceAudit, renderRealmCrossSurfaceArtifacts } from '../scripts/lib/realm-cross-surface-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 4 verifies audience privacy and both interface consumers', () => {
  const result = buildRealmCrossSurfaceAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
});

test('Phase 4 artifacts are deterministic and name ERP as source of truth', () => {
  const result = buildRealmCrossSurfaceAudit(root);
  const first = renderRealmCrossSurfaceArtifacts(result);
  assert.deepEqual(first, renderRealmCrossSurfaceArtifacts(result));
  assert.match(first['PHASE-4-REPORT.md'], /database ERP vẫn là nguồn sự thật duy nhất/);
});
