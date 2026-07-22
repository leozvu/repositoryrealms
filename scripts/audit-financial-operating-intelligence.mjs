import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFinancialOperatingIntelligenceAudit, renderFinancialOperatingIntelligenceArtifacts } from './lib/financial-operating-intelligence-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa', 'financial-operating-intelligence');
const check = process.argv.includes('--check');
const result = buildFinancialOperatingIntelligenceAudit(root);
const artifacts = renderFinancialOperatingIntelligenceArtifacts(result);

if (result.summary.verifiedContracts !== result.summary.contracts || result.summary.verifiedScenarios !== result.summary.scenarios) {
  console.error('Financial Operating Intelligence audit failed.');
  for (const row of [...result.contracts, ...result.scenarios].filter((item) => item.status !== 'verified')) {
    console.error(`${row.id}: ${(row.missingSignals || []).join(', ') || `${row.actual} != ${row.expected}`}`);
  }
  process.exit(1);
}

if (check) {
  for (const [name, content] of Object.entries(artifacts)) {
    const file = path.join(output, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
      console.error(`Financial Operating Intelligence artifact is stale: ${name}`);
      process.exit(1);
    }
  }
  console.log('Financial Operating Intelligence audit artifacts verified.');
} else {
  fs.mkdirSync(output, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(output, name), content);
  console.log('Financial Operating Intelligence audit artifacts generated.');
}
