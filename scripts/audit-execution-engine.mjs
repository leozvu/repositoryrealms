import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExecutionEngineAudit, renderExecutionEngineArtifacts } from './lib/execution-engine-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa', 'execution-engine');
const check = process.argv.includes('--check');
const result = buildExecutionEngineAudit(root);
const artifacts = renderExecutionEngineArtifacts(result);
if (result.summary.verifiedContracts !== result.summary.contracts || result.summary.verifiedScenarios !== result.summary.scenarios) {
  console.error('Execution Engine audit failed.');
  process.exit(1);
}
if (check) {
  for (const [name, content] of Object.entries(artifacts)) {
    const file = path.join(output, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
      console.error(`Execution Engine artifact is stale: ${name}`);
      process.exit(1);
    }
  }
  console.log('Execution Engine audit artifacts verified.');
} else {
  fs.mkdirSync(output, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(output, name), content);
  console.log('Execution Engine audit artifacts generated.');
}
