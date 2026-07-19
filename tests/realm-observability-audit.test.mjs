import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRealmObservabilityAudit, renderRealmObservabilityArtifacts } from '../scripts/lib/realm-observability-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 7 audit xác minh route coverage, privacy và support-ID UX', () => {
  const result = buildRealmObservabilityAudit(root);
  assert.equal(result.summary.verifiedRoutes, result.summary.routes);
  assert.equal(result.summary.verifiedContracts, result.summary.contracts);
  assert.equal(result.summary.verifiedScenarios, result.summary.scenarios);
});

test('Phase 7 artifacts deterministic', () => {
  const first = renderRealmObservabilityArtifacts(buildRealmObservabilityAudit(root));
  const second = renderRealmObservabilityArtifacts(buildRealmObservabilityAudit(root));
  assert.deepEqual(second, first);
});
