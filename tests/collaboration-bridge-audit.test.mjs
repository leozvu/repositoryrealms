import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCollaborationBridgeAudit, renderCollaborationBridgeArtifacts } from '../scripts/lib/collaboration-bridge-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 8 audit verifies shared persistence, identity and dual-surface UX', () => {
  const result = buildCollaborationBridgeAudit(root);
  assert.equal(result.summary.verifiedRoutes, result.summary.routes);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
  assert.equal(result.summary.databaseMutationsExecuted, 0);
});

test('Phase 8 artifacts are deterministic', () => {
  const first = renderCollaborationBridgeArtifacts(buildCollaborationBridgeAudit(root));
  const second = renderCollaborationBridgeArtifacts(buildCollaborationBridgeAudit(root));
  assert.deepEqual(second, first);
});
