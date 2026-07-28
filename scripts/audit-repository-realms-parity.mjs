import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepositoryRealmsParityAudit, renderRepositoryRealmsParityArtifacts } from './lib/repository-realms-parity-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'repository-realms-parity');
const checkOnly = process.argv.includes('--check');
const result = buildRepositoryRealmsParityAudit(root);
const artifacts = renderRepositoryRealmsParityArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('RepositoryRealms invariant evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('RepositoryRealms deterministic parity scenario failed');
if (s.buttonParityRequired || !s.businessInvariantParityRequired) failures.push('Phase 21 must measure invariants, not matching controls');
if (s.additiveMigrations !== 0 || s.parallelBusinessTables !== 0) failures.push('Phase 21 must reuse canonical ERP records and receipts');

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
  for (const failure of failures) console.error(`[phase21] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 21 RepositoryRealms parity gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
