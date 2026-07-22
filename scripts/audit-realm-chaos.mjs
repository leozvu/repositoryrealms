import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmChaosAudit, renderRealmChaosArtifacts } from './lib/realm-chaos-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-chaos');
const checkOnly = process.argv.includes('--check');
const result = buildRealmChaosAudit(root);
const artifacts = renderRealmChaosArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Chaos resilience contract evidence is incomplete');
if (s.verifiedScenarios !== 7 || s.scenarios !== 7) failures.push('All seven deterministic chaos scenarios must be verified');
if (s.automaticWriteRetry || !s.notificationAfterCommit || !s.boundedReconnect) failures.push('Graceful degradation invariants failed');
if (!s.aggregateOnly || s.additiveMigrations !== 0) failures.push('Chaos evidence must be aggregate-only and schema-free');

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
  for (const failure of failures) console.error(`[phase20] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 20 Chaos gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
