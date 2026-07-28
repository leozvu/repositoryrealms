import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmChronicleAudit, renderRealmChronicleArtifacts } from './lib/realm-chronicle-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-chronicle');
const checkOnly = process.argv.includes('--check');
const result = buildRealmChronicleAudit(root);
const artifacts = renderRealmChronicleArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Adventurer Chronicle contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic Chronicle privacy scenario failed');
if (s.databaseMigrations !== 0 || s.parallelBusinessTables !== 0 || s.writeEndpoints !== 0) failures.push('Chronicle must remain a read-only view over ERP records');

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
  for (const failure of failures) console.error(`[phase9] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 9 Adventurer Chronicle gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
