import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmPilotRehearsalAudit, renderRealmPilotRehearsalArtifacts } from './lib/realm-pilot-rehearsal-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-pilot-rehearsal');
const checkOnly = process.argv.includes('--check');
const result = buildRealmPilotRehearsalAudit(root);
const artifacts = renderRealmPilotRehearsalArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Launch Rehearsal contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic Launch Rehearsal scenario failed');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 17 must reuse ERP Setting, Notification and AuditLog');
if (!s.aggregateOnly || s.rosterIncluded || s.selfApprovalAllowed) failures.push('Rehearsal must stay four-eyes and aggregate-only');
if (!s.waveRequiresSeal || s.policyMutationFromRemediation) failures.push('Wave must require a seal while remediation remains read-only');
if (s.sealTtlHours !== 24) failures.push('Sealed evidence must expire after 24 hours');

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
  for (const failure of failures) console.error(`[phase17] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 17 Launch Rehearsal gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
