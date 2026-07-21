import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  realmGeneratedCharacterAssets,
  realmGeneratedCharacterPortraitUrl,
  realmGeneratedDecorAssets,
  realmGeneratedEnvironmentAssets,
  realmGeneratedErpUiAssets,
  realmGeneratedPropAssets,
  realmGeneratedUiAssets,
} from '../lib/realm-generated-art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = path.join(ROOT, 'public', 'realms', 'assets', 'generated', 'phase-22');

async function readManifest(...segments) {
  return JSON.parse(await readFile(path.join(ART_ROOT, ...segments, 'manifest.json'), 'utf8'));
}

test('extracted art manifests retain the expected production asset counts', async () => {
  const [characters, props, propsWebp, frames, framesWebp, materials, erpUi] = await Promise.all([
    readManifest('characters-v2', 'directions-v2'),
    readManifest('props', 'items'),
    readManifest('props', 'items-webp'),
    readManifest('ui', 'frames'),
    readManifest('ui', 'frames-webp'),
    readManifest('maps', 'materials-webp'),
    readManifest('erp-ui', 'elements-webp-v2'),
  ]);
  assert.equal(characters.assetCount, 24);
  assert.equal(characters.largestComponent, true);
  assert.equal(props.assetCount, 36);
  assert.equal(propsWebp.assetCount, 36);
  assert.equal(propsWebp.outputFormat, 'webp');
  assert.equal(frames.assetCount, 15);
  assert.equal(framesWebp.assetCount, 15);
  assert.equal(framesWebp.outputFormat, 'webp');
  assert.equal(materials.assetCount, 8);
  assert.equal(materials.outputFormat, 'webp');
  assert.equal(erpUi.assetCount, 12);
  assert.equal(erpUi.outputFormat, 'webp');
  assert.equal(erpUi.mode, 'named-regions');
});

test('runtime decorative frames resolve inside a strict payload budget', async () => {
  const assets = realmGeneratedUiAssets();
  assert.equal(assets.length, 11);
  let totalBytes = 0;
  for (const asset of assets) {
    const file = path.join(ROOT, 'public', asset.url.replace(/^\//, ''));
    await access(file);
    const bytes = (await stat(file)).size;
    assert.ok(bytes > 0, `${asset.url} must not be empty`);
    totalBytes += bytes;
  }
  assert.ok(totalBytes < 125_000, `decorative UI runtime payload is ${totalBytes} bytes`);
});

test('ERP and CRM ornaments resolve inside a strict dashboard payload budget', async () => {
  const assets = realmGeneratedErpUiAssets();
  assert.equal(assets.length, 12);
  let totalBytes = 0;
  for (const asset of assets) {
    const file = path.join(ROOT, 'public', asset.url.replace(/^\//, ''));
    await access(file);
    const bytes = (await stat(file)).size;
    assert.ok(bytes > 0, `${asset.url} must not be empty`);
    totalBytes += bytes;
  }
  assert.ok(totalBytes < 125_000, `ERP ornament runtime payload is ${totalBytes} bytes`);
});

test('generated UI frames remain decorative and cannot intercept pointer input', async () => {
  const [realmCss, globalCss, guildCss, warCss, tavernCss] = await Promise.all([
    readFile(path.join(ROOT, 'components', 'realm', 'realm-office.module.css'), 'utf8'),
    readFile(path.join(ROOT, 'app', 'globals.css'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'guild-hall.module.css'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'war-room.module.css'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'royal-treasury.module.css'), 'utf8'),
  ]);
  assert.match(realmCss, /data-realm-ui-art='ready'[\s\S]*pointer-events:\s*none/);
  assert.match(realmCss, /profileAvatar::after[\s\S]*pointer-events:\s*none/);
  assert.match(realmCss, /panelHeading::after[\s\S]*pointer-events:\s*none/);
  assert.match(realmCss, /notice::before[\s\S]*pointer-events:\s*none/);
  assert.match(realmCss, /treasurySurface::before[\s\S]*pointer-events:\s*none/);
  assert.match(realmCss, /ledgerHero::before,[\s\S]*ledgerMode::after[\s\S]*pointer-events:\s*none/);
  assert.match(realmCss, /--realm-erp-ui-header-crest/);
  assert.match(realmCss, /--realm-erp-ui-approval-seal/);
  assert.match(realmCss, /--realm-erp-ui-footer-flourish/);
  assert.match(guildCss, /hero::before[\s\S]*pointer-events:\s*none/);
  assert.match(warCss, /hero::before[\s\S]*pointer-events:\s*none/);
  assert.match(tavernCss, /hero::before[\s\S]*pointer-events:\s*none/);
  assert.match(globalCss, /realm-generated-dialog::before[\s\S]*pointer-events:\s*none/);
});

test('business surfaces expose stable visual identities at existing component boundaries', async () => {
  const sources = await Promise.all([
    readFile(path.join(ROOT, 'components', 'realm', 'GuildHall.jsx'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'WarRoom.jsx'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'RealmOffice.jsx'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'RoyalTreasuryExchange.jsx'), 'utf8'),
  ]);
  for (const surface of ['guild', 'war', 'treasury', 'tavern']) {
    assert.ok(sources.some((source) => source.includes(`data-realm-business-surface="${surface}"`)), `${surface} surface identity is missing`);
  }
});

test('runtime business props cover seven objects inside a strict payload budget', async () => {
  const assets = realmGeneratedPropAssets();
  assert.equal(assets.length, 7);
  let totalBytes = 0;
  for (const asset of assets) {
    const file = path.join(ROOT, 'public', asset.url.replace(/^\//, ''));
    await access(file);
    const bytes = (await stat(file)).size;
    assert.ok(bytes > 0, `${asset.url} must not be empty`);
    totalBytes += bytes;
  }
  assert.ok(totalBytes < 100_000, `business prop runtime payload is ${totalBytes} bytes`);
});

test('map decor reuses optimized generated props inside a strict presentation budget', async () => {
  const assets = realmGeneratedDecorAssets();
  let totalBytes = 0;
  for (const asset of assets) {
    const file = path.join(ROOT, 'public', asset.url.replace(/^\//, ''));
    await access(file);
    const bytes = (await stat(file)).size;
    assert.ok(bytes > 0, `${asset.url} must not be empty`);
    totalBytes += bytes;
  }
  assert.ok(totalBytes < 200_000, `map decor runtime payload is ${totalBytes} bytes`);
});

test('every declared world business object has one generated prop binding', async () => {
  const worldSource = await readFile(path.join(ROOT, 'components', 'realm', 'world.js'), 'utf8');
  const objectBlock = worldSource.match(/export const WORLD_OBJECTS = \[([\s\S]*?)\n\];/)?.[1] || '';
  const objectIds = [...objectBlock.matchAll(/\{ id: '([^']+)', panel:/g)].map((match) => match[1]);
  assert.equal(objectIds.length, 7);
  assert.deepEqual(new Set(realmGeneratedPropAssets().map((asset) => asset.objectId)), new Set(objectIds));
});

test('every runtime environment URL resolves to an optimized non-empty asset', async () => {
  let totalBytes = 0;
  for (const asset of realmGeneratedEnvironmentAssets()) {
    const file = path.join(ROOT, 'public', asset.url.replace(/^\//, ''));
    await access(file);
    const bytes = (await stat(file)).size;
    assert.ok(bytes > 0, `${asset.url} must not be empty`);
    totalBytes += bytes;
  }
  assert.ok(totalBytes < 750_000, `environment runtime payload is ${totalBytes} bytes`);
});

test('every runtime character URL resolves to a non-empty checked-in file', async () => {
  for (const asset of realmGeneratedCharacterAssets()) {
    const file = path.join(ROOT, 'public', asset.url.replace(/^\//, ''));
    await access(file);
    assert.ok((await stat(file)).size > 0, `${asset.url} must not be empty`);
  }
});

test('detailed v1 renders remain available as deterministic onboarding portraits', async () => {
  for (const identity of ['realm-user-1', 'realm-user-2', 'realm-user-3', 'realm-user-4', 'realm-user-5', 'realm-user-6']) {
    const url = realmGeneratedCharacterPortraitUrl(identity);
    const file = path.join(ROOT, 'public', url.replace(/^\//, ''));
    await access(file);
    assert.ok((await stat(file)).size > 0, `${url} must not be empty`);
  }
});

test('inspector ornaments and compact surfaces contain content instead of covering it', async () => {
  const [realmCss, warCss, commandCss, guildCss] = await Promise.all([
    readFile(path.join(ROOT, 'components', 'realm', 'realm-office.module.css'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'war-room.module.css'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'royal-command-center.module.css'), 'utf8'),
    readFile(path.join(ROOT, 'components', 'realm', 'guild-hall.module.css'), 'utf8'),
  ]);
  assert.match(realmCss, /container-name:\s*realm-inspector/);
  assert.match(realmCss, /inspectorScroll[\s\S]*overflow-x:\s*hidden/);
  assert.match(realmCss, /questCard::before[\s\S]*notice-corner-tl/);
  assert.doesNotMatch(realmCss, /inspector::before\s*\{[\s\S]{0,260}background-image:\s*var\(--realm-ui-inspector\)/);
  for (const css of [warCss, commandCss, guildCss]) {
    assert.match(css, /\.compact \.hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  }
});

test('master art remains versioned and available without replacing procedural rendering', async () => {
  const required = [
    ['concept', 'repositoryrealms-visual-bible-v1.png'],
    ['maps', 'realm-office-master-map-v1.png'],
    ['maps', 'realm-environment-material-atlas-v1.png'],
    ['characters', 'realm-character-roster-v1.png'],
    ['props', 'realm-office-prop-atlas-v1.png'],
    ['ui', 'realm-ui-ornament-atlas-v1.png'],
  ];
  for (const segments of required) {
    const file = path.join(ART_ROOT, ...segments);
    await access(file);
    assert.ok((await stat(file)).size > 0, `${segments.join('/')} must not be empty`);
  }
});
