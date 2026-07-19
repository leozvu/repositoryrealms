import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiActionMap, renderActionMapArtifacts } from './lib/ui-action-map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'ui-action-map');
const checkOnly = process.argv.includes('--check');
const actionMap = buildUiActionMap(root);

if (actionMap.parseErrors.length) {
  for (const error of actionMap.parseErrors) console.error(`[parse_error] ${error.source}: ${error.message}`);
  process.exitCode = 1;
} else {
  const artifacts = renderActionMapArtifacts(actionMap);
  if (checkOnly) {
    const changed = [];
    for (const [name, content] of Object.entries(artifacts)) {
      const target = path.join(outputDirectory, name);
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) changed.push(name);
    }
    if (changed.length) {
      console.error(`UI action map is stale or missing: ${changed.join(', ')}. Run npm run audit:ui:actions.`);
      process.exitCode = 1;
    } else {
      console.log(`UI action map is current: ${actionMap.summary.elements} elements, ${actionMap.summary.dataActions} data actions, ${actionMap.summary.actionableUnresolved} actionable unresolved.`);
    }
  } else {
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const [name, content] of Object.entries(artifacts)) {
      fs.writeFileSync(path.join(outputDirectory, name), content, 'utf8');
    }
    console.log(`Wrote Phase 2 action map: ${actionMap.summary.elements} elements, ${actionMap.summary.dataActions} data actions, ${actionMap.summary.actionableUnresolved} actionable unresolved.`);
  }
}
