import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmLaunchAudit, renderRealmLaunchArtifacts } from './lib/realm-launch-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-launch');
const checkOnly = process.argv.includes('--check');
const result = buildRealmLaunchAudit(root);
const artifacts = renderRealmLaunchArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('controlled launch contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic controlled launch scenario failed');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 14 must reuse ERP Setting, User, Ticket and presence data');
if (!s.aggregateOnly || s.rosterIncluded || s.performanceTracking !== false || s.durationTracking !== false) failures.push('launch impact must remain aggregate-only and privacy-safe');
if (s.killSwitchRequiresPreview) failures.push('kill switch must never depend on launch preview');

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
  for (const failure of failures) console.error(`[phase14] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 14 Realm Launch gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
