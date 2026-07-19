import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmCohortAudit, renderRealmCohortArtifacts } from './lib/realm-cohort-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-cohort');
const checkOnly = process.argv.includes('--check');
const result = buildRealmCohortAudit(root);
const artifacts = renderRealmCohortArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('named cohort contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic named cohort scenario failed');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 13 must reuse Setting and User data already present in ERP');
if (!s.rosterHiddenFromNonDirectors) failures.push('named roster must stay Director-only');
if (!s.aggregateOnly || s.performanceTracking !== false || s.durationTracking !== false) failures.push('cohort adoption must stay aggregate-only and avoid personal tracking');

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
  for (const failure of failures) console.error(`[phase13] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 13 Realm Cohort gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
