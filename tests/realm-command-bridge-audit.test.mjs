import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmCommandBridgeAudit, renderRealmCommandBridgeArtifacts } from '../scripts/lib/realm-command-bridge-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 5 verifies Realm command security, concurrency and feedback loop contracts', () => {
  const result = buildRealmCommandBridgeAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
});

test('Phase 5 artifacts are deterministic and keep ERP as source of truth', () => {
  const result = buildRealmCommandBridgeAudit(root);
  const first = renderRealmCommandBridgeArtifacts(result);
  assert.deepEqual(first, renderRealmCommandBridgeArtifacts(result));
  assert.match(first['PHASE-5-REPORT.md'], /Database ERP vẫn là nguồn sự thật duy nhất/);
});
