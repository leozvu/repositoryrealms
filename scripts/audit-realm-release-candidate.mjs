import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmReleaseCandidateAudit, renderRealmReleaseCandidateArtifacts } from './lib/realm-release-candidate-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-release-candidate');
const checkOnly = process.argv.includes('--check');
const result = buildRealmReleaseCandidateAudit(root);
const artifacts = renderRealmReleaseCandidateArtifacts(result);
const failures = [];
const summary = result.summary;

if (summary.verifiedContracts !== summary.contracts) failures.push('Phase 24 release candidate contract evidence is incomplete');
if (summary.evidenceSources !== 5) failures.push('Release Candidate dossier requires five evidence sources');
if (!summary.deterministicDigest || summary.authoritativeLaunchGate) failures.push('Release Candidate integrity/governance invariants failed');
if (!summary.aggregateOnly || summary.userIdsIncluded || summary.businessRecordIdsIncluded) failures.push('Release Candidate privacy invariants failed');
if (summary.additiveMigrations !== 0) failures.push('Release Candidate dossier must remain schema-free');

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
  for (const failure of failures) console.error(`[phase24] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 24 Release Candidate gate passed: ${summary.verifiedContracts}/${summary.contracts} contracts, ${summary.evidenceSources}/5 evidence sources.`);
}
