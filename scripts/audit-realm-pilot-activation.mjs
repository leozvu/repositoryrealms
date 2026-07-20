import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotActivationAudit, renderRealmPilotActivationArtifacts } from './lib/realm-pilot-activation-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-pilot-activation');
const checkOnly = process.argv.includes('--check');
const result = buildRealmPilotActivationAudit(root);
const artifacts = renderRealmPilotActivationArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Canary Activation contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic Canary Activation scenario failed');
if (s.canaryWindowMinutes !== 90) failures.push('Canary observation window must remain 90 minutes');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 18 must reuse ERP Pilot Operations state');
if (!s.aggregateOnly || s.automaticCohortExpansion) failures.push('Activation evidence must stay aggregate-only and cannot expand the cohort');
if (!s.rollbackAlwaysAvailable) failures.push('ERP rollback must remain available during activation');

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
  for (const failure of failures) console.error(`[phase18] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 18 Canary Activation gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
