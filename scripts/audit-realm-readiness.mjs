import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmReadinessAudit, renderRealmReadinessArtifacts } from './lib/realm-readiness-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-readiness');
const checkOnly = process.argv.includes('--check');
const result = buildRealmReadinessAudit(root);
const artifacts = renderRealmReadinessArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Realm readiness contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic Realm launch scenario failed');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 12 must reuse the existing ERP schema and Setting policy');
if (!s.aggregateOnly || s.performanceTracking !== false || s.durationTracking !== false) failures.push('Realm readiness must stay aggregate-only and avoid personal tracking');

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
  for (const failure of failures) console.error(`[phase12] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 12 Realm Readiness gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
