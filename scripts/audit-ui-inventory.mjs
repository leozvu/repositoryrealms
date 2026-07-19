import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiInventory, renderInventoryArtifacts } from './lib/ui-inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'ui-inventory');
const checkOnly = process.argv.includes('--check');
const inventory = buildUiInventory(root);

if (inventory.parseErrors.length) {
  for (const error of inventory.parseErrors) console.error(`[parse_error] ${error.source}: ${error.message}`);
  process.exitCode = 1;
} else {
  const artifacts = renderInventoryArtifacts(inventory);
  if (checkOnly) {
    const changed = [];
    for (const [name, content] of Object.entries(artifacts)) {
      const target = path.join(outputDirectory, name);
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) changed.push(name);
    }
    if (changed.length) {
      console.error(`UI inventory is stale or missing: ${changed.join(', ')}. Run npm run audit:ui:inventory.`);
      process.exitCode = 1;
    } else {
      console.log(`UI inventory is current: ${inventory.summary.uiRoutes} UI routes, ${inventory.summary.apiRoutes} API routes, ${inventory.summary.interactiveElements} elements.`);
    }
  } else {
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const [name, content] of Object.entries(artifacts)) {
      fs.writeFileSync(path.join(outputDirectory, name), content, 'utf8');
    }
    console.log(`Wrote Phase 1 inventory: ${inventory.summary.uiRoutes} UI routes, ${inventory.summary.apiRoutes} API routes, ${inventory.summary.interactiveElements} elements.`);
  }
}
