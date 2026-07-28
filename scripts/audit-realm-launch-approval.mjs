import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmLaunchApprovalAudit, renderRealmLaunchApprovalArtifacts } from './lib/realm-launch-approval-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-launch-approval');
const checkOnly = process.argv.includes('--check');
const result = buildRealmLaunchApprovalAudit(root);
const artifacts = renderRealmLaunchApprovalArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('four-eyes launch approval contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic maker-checker scenario failed');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 15 must reuse Approval and Setting already present in ERP');
if (!s.encryptedAtRest || !s.aggregateOnly || s.rosterIncluded) failures.push('pending launch policy must remain encrypted and aggregate-only');
if (s.selfApprovalAllowed || s.killSwitchRequiresApproval) failures.push('maker cannot self-approve and kill switch cannot depend on approval');

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
  for (const failure of failures) console.error(`[phase15] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 15 Four-eyes Launch Approval gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
