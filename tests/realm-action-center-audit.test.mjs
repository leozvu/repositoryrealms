import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmActionCenterAudit, renderRealmActionCenterArtifacts } from '../scripts/lib/realm-action-center-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 6 verifies additive create, privacy, scope and cross-surface contracts', () => {
  const result = buildRealmActionCenterAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
});

test('Phase 6 artifacts are deterministic and keep ERP as source of truth', () => {
  const result = buildRealmActionCenterAudit(root);
  const first = renderRealmActionCenterArtifacts(result);
  assert.deepEqual(first, renderRealmActionCenterArtifacts(result));
  assert.match(first['PHASE-6-REPORT.md'], /ERP vẫn là nguồn sự thật/);
});
