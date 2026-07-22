import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmCommandCenterAudit, renderRealmCommandCenterArtifacts } from '../scripts/lib/realm-command-center-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 8 verifies Task source, RBAC, concurrency, handoff, realtime and accessible UI contracts', () => {
  const result = buildRealmCommandCenterAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.databaseMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
});

test('Phase 8 artifacts are deterministic and preserve the classic ERP Task surface', () => {
  const result = buildRealmCommandCenterAudit(root);
  const first = renderRealmCommandCenterArtifacts(result);
  assert.deepEqual(first, renderRealmCommandCenterArtifacts(result));
  assert.match(first['PHASE-8-REPORT.md'], /Task ERP là nguồn sự thật duy nhất/);
  assert.match(first['PHASE-8-REPORT.md'], /không thay thế màn hình Task ERP nguyên bản/);
});
