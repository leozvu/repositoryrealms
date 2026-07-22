import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmFeedbackAudit, renderRealmFeedbackArtifacts } from '../scripts/lib/realm-feedback-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 11 verifies Ticket integration, RBAC, privacy, idempotency and accessible cross-surface UX', () => {
  const result = buildRealmFeedbackAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.additiveMigrations, 1);
  assert.equal(result.summary.parallelFeedbackTables, 0);
  assert.equal(result.summary.performanceTracking, false);
  assert.equal(result.summary.durationTracking, false);
});

test('Phase 11 artifacts are deterministic and state the privacy boundary', () => {
  const result = buildRealmFeedbackAudit(root);
  const first = renderRealmFeedbackArtifacts(result);
  assert.deepEqual(first, renderRealmFeedbackArtifacts(result));
  assert.match(first['PHASE-11-REPORT.md'], /Ticket ERP/);
  assert.match(first['PHASE-11-REPORT.md'], /Không thu form values/);
});
