import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmExperienceAudit, renderRealmExperienceArtifacts } from './lib/realm-experience-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-experience');
const checkOnly = process.argv.includes('--check');
const result = buildRealmExperienceAudit(root);
const artifacts = renderRealmExperienceArtifacts(result);
const failures = [];
const summary = result.summary;

if (summary.verifiedContracts !== summary.contracts) failures.push('Phase 22/23 experience contract evidence is incomplete');
if (summary.verifiedJourneys !== 4 || summary.journeys !== 4) failures.push('All four business journeys require evidence');
if (!summary.aggregateOnly || summary.authoritativeLaunchGate || summary.recordIdsStored || summary.performanceTracking) failures.push('Experience privacy/governance invariants failed');
if (summary.additiveMigrations !== 0) failures.push('Experience telemetry must remain schema-free');

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
  for (const failure of failures) console.error(`[phase22-23] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 22–23 Experience gate passed: ${summary.verifiedContracts}/${summary.contracts} contracts, ${summary.verifiedJourneys}/${summary.journeys} journeys.`);
}
