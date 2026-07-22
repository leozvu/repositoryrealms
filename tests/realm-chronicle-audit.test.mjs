import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmChronicleAudit, renderRealmChronicleArtifacts } from '../scripts/lib/realm-chronicle-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 9 verifies self scope, privacy, deep links, realtime and accessible UI contracts', () => {
  const result = buildRealmChronicleAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.databaseMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.writeEndpoints, 0);
});

test('Phase 9 artifacts are deterministic and preserve original ERP personal routes', () => {
  const result = buildRealmChronicleAudit(root);
  const first = renderRealmChronicleArtifacts(result);
  assert.deepEqual(first, renderRealmChronicleArtifacts(result));
  assert.match(first['PHASE-9-REPORT.md'], /current user/);
  assert.match(first['PHASE-9-REPORT.md'], /không thay thế các màn ERP nguyên bản/);
});
