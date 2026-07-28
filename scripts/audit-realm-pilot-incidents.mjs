import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotIncidentAudit, renderRealmPilotIncidentArtifacts } from './lib/realm-pilot-incident-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-pilot-incidents');
const checkOnly = process.argv.includes('--check');
const result = buildRealmPilotIncidentAudit(root);
const artifacts = renderRealmPilotIncidentArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Pilot Incident contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic Pilot Incident scenario failed');
if (s.incidentLimit !== 40) failures.push('Pilot Incident history must stay bounded');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 19 must reuse ERP Pilot Operations state');
if (!s.aggregateOnly || s.automaticReactivation) failures.push('Incident evidence must stay aggregate-only and cannot reactivate Realm');
if (!s.criticalRollbackAtomic) failures.push('Critical incident must rollback atomically to ERP');

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
  for (const failure of failures) console.error(`[phase19] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 19 Pilot Incident gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
