import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmUnifiedInboxAudit, renderRealmUnifiedInboxArtifacts } from '../scripts/lib/realm-unified-inbox-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 7 verifies shared inbox, deep-link, scope and timeline privacy contracts', () => {
  const result = buildRealmUnifiedInboxAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.databaseMigrations, 0);
});

test('Phase 7 artifacts are deterministic and preserve ERP source of truth', () => {
  const result = buildRealmUnifiedInboxAudit(root);
  const first = renderRealmUnifiedInboxArtifacts(result);
  assert.deepEqual(first, renderRealmUnifiedInboxArtifacts(result));
  assert.match(first['PHASE-7-REPORT.md'], /ERP vẫn là nguồn sự thật duy nhất/);
});
