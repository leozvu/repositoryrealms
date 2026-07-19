import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmAccessAudit, renderRealmAccessArtifacts } from './lib/realm-access-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-access-control');
const checkOnly = process.argv.includes('--check');
const result = buildRealmAccessAudit(root);
const artifacts = renderRealmAccessArtifacts(result);
const failures = [];
const s = result.summary;

if (s.failedPolicies) failures.push(`${s.failedPolicies} invalid or duplicate policies`);
if (s.verifiedRoleScenarios !== s.roleScenarios) failures.push('role access matrix drift');
if (s.verifiedModuleScenarios !== s.moduleScenarios) failures.push('module access matrix drift');
if (s.verifiedEnforcementContracts !== s.enforcementContracts) failures.push('server/UI access enforcement evidence is incomplete');

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
  for (const failure of failures) console.error(`[phase5] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 5 access gate passed: ${s.verifiedRoleScenarios}/${s.roleScenarios} role scenarios, ${s.verifiedModuleScenarios}/${s.moduleScenarios} module scenarios, ${s.verifiedEnforcementContracts}/${s.enforcementContracts} enforcement contracts.`);
}
