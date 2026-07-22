import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmLaunchApprovalAudit, renderRealmLaunchApprovalArtifacts } from '../scripts/lib/realm-launch-approval-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 15 audit verifies every four-eyes contract and deterministic scenario', () => {
  const result = buildRealmLaunchApprovalAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.additiveMigrations, 0);
  assert.equal(result.summary.parallelBusinessTables, 0);
  assert.equal(result.summary.encryptedAtRest, true);
  assert.equal(result.summary.rosterIncluded, false);
  assert.equal(result.summary.selfApprovalAllowed, false);
  assert.equal(result.summary.killSwitchRequiresApproval, false);
});

test('Phase 15 audit artifacts are deterministic and human-readable', () => {
  const artifacts = renderRealmLaunchApprovalArtifacts(buildRealmLaunchApprovalAudit(root));
  assert.deepEqual(Object.keys(artifacts).sort(), ['PHASE-15-REPORT.md', 'launch-approval-contracts.csv', 'launch-approval-verification.json']);
  assert.match(artifacts['PHASE-15-REPORT.md'], /Four-eyes Launch Approval/);
  assert.match(artifacts['launch-approval-contracts.csv'], /encrypted-policy-payload/);
  assert.equal(JSON.parse(artifacts['launch-approval-verification.json']).summary.approvalTtlHours, 24);
});
