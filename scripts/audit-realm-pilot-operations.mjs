import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotOperationsAudit, renderRealmPilotOperationsArtifacts } from './lib/realm-pilot-operations-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-pilot-operations');
const checkOnly = process.argv.includes('--check');
const result = buildRealmPilotOperationsAudit(root);
const artifacts = renderRealmPilotOperationsArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Pilot Operations contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic Pilot Operations scenario failed');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 16 must reuse ERP Setting, Notification and AuditLog');
if (!s.aggregateOnly || s.rosterIncluded || s.selfApprovalAllowed) failures.push('Wave activation must stay four-eyes and aggregate-only');
if (!s.pausePreservesData) failures.push('Wave pause must preserve ERP/Realm data');

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
  for (const failure of failures) console.error(`[phase16] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 16 Pilot Operations gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
