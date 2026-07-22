import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotAudit, renderRealmPilotArtifacts } from './lib/realm-pilot-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-pilot');
const checkOnly = process.argv.includes('--check');
const result = buildRealmPilotAudit(root);
const artifacts = renderRealmPilotArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Realm pilot contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic Realm pilot scenario failed');
if (s.additiveMigrations !== 1 || s.parallelBusinessTables !== 0) failures.push('Realm pilot must remain additive without parallel business tables');
if (s.performanceTracking !== false) failures.push('Realm pilot must not track individual performance');

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
  for (const failure of failures) console.error(`[phase10] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 10 Realm Pilot gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
