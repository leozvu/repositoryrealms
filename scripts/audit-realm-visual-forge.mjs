import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditRealmVisualForge } from './lib/realm-visual-forge-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = auditRealmVisualForge(root);

if (!result.summary.passed) {
  for (const failure of result.failures) {
    const subject = failure.source || failure.id || failure.kind;
    const reason = failure.reason || (failure.missingSignals?.length ? `missing: ${failure.missingSignals.join(', ')}` : 'contract failed');
    console.error(`[visual-forge] ${subject}: ${reason}`);
  }
  process.exitCode = 1;
} else {
  const summary = result.summary;
  console.log(`Realm Visual Forge v1 passed: ${summary.verifiedAssets}/${summary.assets} preproduction assets, ${summary.layerStack} 2.5D layers, ${summary.characterFamilies} character families, ${summary.businessZones} business zones, ${summary.scoreDimensions} quality dimensions, ${summary.motionContracts} preserved motion contracts.`);
}
