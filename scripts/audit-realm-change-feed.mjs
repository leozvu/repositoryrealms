import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmChangeFeedAudit, renderRealmChangeFeedArtifacts } from './lib/realm-change-feed-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-change-feed');
const checkOnly = process.argv.includes('--check');
const result = buildRealmChangeFeedAudit(root);
const artifacts = renderRealmChangeFeedArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('change-feed contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic change-feed scenario failed');

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
  console.log(`Phase 3 change-feed gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
