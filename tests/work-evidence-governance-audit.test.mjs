import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildWorkEvidenceGovernanceAudit,
  renderWorkEvidenceGovernanceArtifacts,
} from '../scripts/lib/work-evidence-governance-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 0 audit verifies shadow governance and disabled collection', () => {
  const result = buildWorkEvidenceGovernanceAudit(root);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.mode, 'shadow');
  assert.equal(result.summary.collectionActive, false);
  assert.equal(result.summary.decisionAutomationActive, false);
});

test('Phase 0 governance artifacts are deterministic', () => {
  const artifacts = renderWorkEvidenceGovernanceArtifacts(buildWorkEvidenceGovernanceAudit(root));
  for (const [name, content] of Object.entries(artifacts)) {
    assert.equal(fs.readFileSync(path.join(root, 'qa', 'evidence-governance', name), 'utf8'), content, name);
  }
});
