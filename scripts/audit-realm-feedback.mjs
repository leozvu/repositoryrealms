import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmFeedbackAudit, renderRealmFeedbackArtifacts } from './lib/realm-feedback-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-feedback');
const checkOnly = process.argv.includes('--check');
const result = buildRealmFeedbackAudit(root);
const artifacts = renderRealmFeedbackArtifacts(result);
const failures = [];
const s = result.summary;

if (s.verifiedContracts !== s.contracts) failures.push('Realm feedback contract evidence is incomplete');
if (s.verifiedScenarios !== s.scenarios) failures.push('deterministic Realm feedback scenario failed');
if (s.additiveMigrations !== 1 || s.parallelFeedbackTables !== 0) failures.push('Realm feedback must extend ERP Ticket without a parallel business table');
if (s.performanceTracking !== false || s.durationTracking !== false) failures.push('Realm feedback must not track individual performance or duration');

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
  for (const failure of failures) console.error(`[phase11] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 11 Realm Feedback gate passed: ${s.verifiedContracts}/${s.contracts} contracts, ${s.verifiedScenarios}/${s.scenarios} scenarios.`);
}
