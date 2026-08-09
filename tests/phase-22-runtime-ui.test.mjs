import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('ERP shell declares the shared Phase 22 visual system without changing route structure', () => {
  const shell = read('components', 'Shell.jsx');

  assert.match(shell, /repository-realms-workspace/);
  assert.match(shell, /data-visual-system="phase-22"/);
  assert.match(shell, /isRealmRoute[\s\S]*realm-immersive[\s\S]*repository-realms-workspace/);
  assert.match(shell, /realmV2Theme/);
});

test('ERP and login consume generated map, material and ornament assets as decorative layers', () => {
  const css = read('app', 'globals.css');
  const expectedAssets = [
    'realm-office-master-map-v1.png',
    'material-threshold.webp',
    'material-wall.webp',
    'frame-001.webp',
    'frame-004.webp',
    'frame-006.webp',
    'frame-007.webp',
    'frame-011.webp',
  ];

  for (const asset of expectedAssets) assert.ok(css.includes(asset), `${asset} is not wired into the shared UI`);
  for (const selector of [
    '#app.repository-realms-workspace #sidebar{',
    '#app.repository-realms-workspace #topbar{',
    '#app.repository-realms-workspace .card,',
    '#app.repository-realms-workspace .table-wrap,',
    '.login-wrap::before{',
    '.login-card::before{',
  ]) assert.ok(css.includes(selector), `${selector} is not part of the shared visual system`);
  assert.match(css, /pointer-events:none/);
});

test('Realm ERP mode preloads and exposes the dedicated medieval-enterprise ornament catalog', () => {
  const office = read('components', 'realm', 'RealmOffice.jsx');
  const art = read('lib', 'realm-generated-art.js');
  const css = read('components', 'realm', 'realm-office.module.css');

  assert.match(office, /realmGeneratedErpUiAssets/);
  assert.match(office, /--realm-erp-ui-/);
  assert.match(art, /elements-webp-v2/);
  for (const asset of ['header-crest', 'title-plaque', 'table-finials', 'kpi-medallion', 'approval-seal', 'footer-flourish']) {
    assert.ok(css.includes(`--realm-erp-ui-${asset}`), `${asset} is not wired into ERP mode`);
  }
});

test('Phase 22 runtime contract documents default generated art and independent rollback', () => {
  const manifest = read('public', 'realms', 'assets', 'generated', 'phase-22', 'ASSET-MANIFEST.md');

  assert.match(manifest, /default Realm presentation/);
  assert.match(manifest, /NEXT_PUBLIC_REALM_GENERATED_ART=0/);
  assert.match(manifest, /NEXT_PUBLIC_REALM_ENVIRONMENT_ART=0/);
  assert.match(manifest, /NEXT_PUBLIC_REALM_PROP_ART=0/);
  assert.match(manifest, /NEXT_PUBLIC_REALM_UI_ART=0/);
  assert.match(manifest, /procedural fallback/);
});
