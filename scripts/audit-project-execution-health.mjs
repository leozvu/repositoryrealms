import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjectExecutionHealthAudit, renderProjectExecutionHealthArtifacts } from './lib/project-execution-health-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa', 'project-execution-health');
const check = process.argv.includes('--check');
const result = buildProjectExecutionHealthAudit(root);
const artifacts = renderProjectExecutionHealthArtifacts(result);

if (result.summary.verifiedContracts !== result.summary.contracts || result.summary.verifiedScenarios !== result.summary.scenarios) {
  console.error('Project Execution Health audit failed.');
  for (const row of [...result.contracts, ...result.scenarios].filter((item) => item.status !== 'verified')) {
    console.error(`${row.id}: ${(row.missingSignals || []).join(', ') || `${row.actual} != ${row.expected}`}`);
  }
  process.exit(1);
}

if (check) {
  for (const [name, content] of Object.entries(artifacts)) {
    const file = path.join(output, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
      console.error(`Project Execution Health artifact is stale: ${name}`);
      process.exit(1);
    }
  }
  console.log('Project Execution Health audit artifacts verified.');
} else {
  fs.mkdirSync(output, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(output, name), content);
  console.log('Project Execution Health audit artifacts generated.');
}
