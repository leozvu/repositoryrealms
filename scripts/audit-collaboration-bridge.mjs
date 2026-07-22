import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCollaborationBridgeAudit, renderCollaborationBridgeArtifacts } from './lib/collaboration-bridge-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'collaboration-bridge');
const checkOnly = process.argv.includes('--check');
const result = buildCollaborationBridgeAudit(root);
const artifacts = renderCollaborationBridgeArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedRoutes !== s.routes) failures.push('collaboration API route coverage is incomplete');
if (s.verifiedContracts !== s.contracts) failures.push('collaboration bridge contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic collaboration scenario failed');

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
  for (const failure of failures) console.error(`[phase8] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 8 collaboration gate passed: ${s.verifiedRoutes}/${s.routes} routes, ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
