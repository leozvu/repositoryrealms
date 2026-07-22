import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealmErpBridgeAudit, renderRealmErpBridgeArtifacts } from './lib/realm-erp-bridge-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-erp-bridge');
const checkOnly = process.argv.includes('--check');
const result = buildRealmErpBridgeAudit(root);
const artifacts = renderRealmErpBridgeArtifacts(result);
const failures = [];
const s = result.summary;

if (s.mappedNavigationRoutes !== s.erpNavigationRoutes) failures.push('ERP navigation mapping is incomplete');
if (s.verifiedNavigationRoutes !== s.erpNavigationRoutes) failures.push('one or more mapped ERP route files are missing');
if (s.verifiedRecordFlows !== s.recordFlows) failures.push('record-level bridge flow evidence is incomplete');
if (s.verifiedLinkContracts !== s.linkContracts) failures.push('record deep-link contract failed');
if (s.unresolvedMappings) failures.push(`${s.unresolvedMappings} unresolved mappings`);
if (s.catalogDrift) failures.push(`${s.catalogDrift} navigation catalog drift entries`);

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
  for (const failure of failures) console.error(`[phase4] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 4 bridge gate passed: ${s.verifiedNavigationRoutes}/${s.erpNavigationRoutes} ERP routes mapped, ${s.verifiedRecordFlows}/${s.recordFlows} record flows verified, 0 unresolved.`);
}
