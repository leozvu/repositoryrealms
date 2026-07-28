import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiInteractionVerification, renderUiInteractionArtifacts } from './lib/ui-interaction-verification.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'ui-interaction-verification');
const checkOnly = process.argv.includes('--check');
const result = buildUiInteractionVerification(root);
const artifacts = renderUiInteractionArtifacts(result);
const failures = [];

if (result.summary.finalCandidateElements) failures.push(`${result.summary.finalCandidateElements} UX candidate elements remain`);
if (result.summary.destructiveFlowsVerified !== result.summary.destructiveFlows) failures.push('destructive confirmation coverage is incomplete');

if (checkOnly) {
  const stale = Object.entries(artifacts)
    .filter(([name, content]) => !fs.existsSync(path.join(outputDirectory, name)) || fs.readFileSync(path.join(outputDirectory, name), 'utf8') !== content)
    .map(([name]) => name);
  if (stale.length) failures.push(`stale artifacts: ${stale.join(', ')}`);
} else {
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(outputDirectory, name), content, 'utf8');
}

if (failures.length) {
  for (const failure of failures) console.error(`[phase3] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 3 interaction gate passed: ${result.summary.guardedActions} guarded actions, ${result.summary.destructiveFlowsVerified}/${result.summary.destructiveFlows} destructive flows confirmed, 0 UX candidates.`);
}
