import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWorkEvidenceGovernanceAudit,
  renderWorkEvidenceGovernanceArtifacts,
} from './lib/work-evidence-governance-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'evidence-governance');
const checkOnly = process.argv.includes('--check');
const result = buildWorkEvidenceGovernanceAudit(root);
const artifacts = renderWorkEvidenceGovernanceArtifacts(result);
const failures = [];
const summary = result.summary;

if (summary.verifiedContracts !== summary.contracts) failures.push('Evidence governance contract is incomplete');
if (summary.verifiedScenarios !== summary.scenarios) failures.push('Evidence governance scenario failed');
if (summary.mode !== 'shadow' || summary.collectionActive) failures.push('Phase 0 must remain shadow with collection disabled');
if (summary.decisionAutomationActive) failures.push('Phase 0 decision automation must remain disabled');

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
  for (const failure of failures) console.error(`[phase0] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 0 evidence governance gate passed: ${summary.verifiedContracts}/${summary.contracts} contracts, ${summary.verifiedScenarios}/${summary.scenarios} scenarios.`);
}
