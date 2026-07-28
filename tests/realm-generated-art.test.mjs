import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REALM_GENERATED_DIRECTIONS,
  REALM_GENERATED_ENVIRONMENT_MATERIALS,
  REALM_GENERATED_ERP_UI_BINDINGS,
  REALM_GENERATED_PROP_BINDINGS,
  REALM_GENERATED_UI_BINDINGS,
  REALM_MAP_STYLES,
  realmArtDirectionFromDelta,
  realmGeneratedArtEnabled,
  realmGeneratedCharacterAssets,
  realmGeneratedCharacterKey,
  realmGeneratedCharacterPortraitUrl,
  realmGeneratedCharacterSlot,
  realmGeneratedCharacterUrl,
  realmGeneratedEnvironmentAssets,
  realmGeneratedEnvironmentEnabled,
  realmGeneratedEnvironmentUrl,
  realmGeneratedDecorAssets,
  realmGeneratedErpUiAssets,
  realmGeneratedErpUiBinding,
  realmGeneratedErpUiUrl,
  realmGeneratedPropAssets,
  realmGeneratedPropBinding,
  realmGeneratedPropEnabled,
  realmGeneratedPropUrl,
  realmGeneratedUiAssets,
  realmGeneratedUiBinding,
  realmGeneratedUiEnabled,
  realmGeneratedUiUrl,
  normalizeRealmMapStyle,
  realmMapStyle,
} from '../lib/realm-generated-art.js';

test('generated art is the default experience while every layer retains an explicit safe opt-out', () => {
  const keys = [
    'NEXT_PUBLIC_REALM_GENERATED_ART',
    'NEXT_PUBLIC_REALM_ENVIRONMENT_ART',
    'NEXT_PUBLIC_REALM_PROP_ART',
    'NEXT_PUBLIC_REALM_UI_ART',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    assert.equal(realmGeneratedArtEnabled(), true);
    assert.equal(realmGeneratedEnvironmentEnabled(), true);
    assert.equal(realmGeneratedPropEnabled(), true);
    assert.equal(realmGeneratedUiEnabled(), true);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
  assert.equal(realmGeneratedArtEnabled('0'), false);
  assert.equal(realmGeneratedArtEnabled('false'), false);
  assert.equal(realmGeneratedArtEnabled('1'), true);
  assert.equal(realmGeneratedArtEnabled('true'), true);
  assert.equal(realmGeneratedEnvironmentEnabled('0'), false);
  assert.equal(realmGeneratedEnvironmentEnabled('false'), false);
  assert.equal(realmGeneratedEnvironmentEnabled('1'), true);
  assert.equal(realmGeneratedEnvironmentEnabled('true'), true);
  assert.equal(realmGeneratedPropEnabled('0'), false);
  assert.equal(realmGeneratedPropEnabled('false'), false);
  assert.equal(realmGeneratedPropEnabled('1'), true);
  assert.equal(realmGeneratedPropEnabled('true'), true);
  assert.equal(realmGeneratedUiEnabled('0'), false);
  assert.equal(realmGeneratedUiEnabled('false'), false);
  assert.equal(realmGeneratedUiEnabled('1'), true);
  assert.equal(realmGeneratedUiEnabled('true'), true);
});

test('decorative UI catalog exposes optimized non-interactive surface bindings', () => {
  const assets = realmGeneratedUiAssets();
  assert.equal(assets.length, 11);
  assert.deepEqual(new Set(assets.map((asset) => asset.surface)), new Set(Object.keys(REALM_GENERATED_UI_BINDINGS)));
  assert.equal(realmGeneratedUiBinding('inspector')?.asset, '001');
  assert.equal(realmGeneratedUiBinding('dialog')?.asset, '005');
  assert.equal(realmGeneratedUiBinding('profile-ring')?.asset, '006');
  assert.equal(realmGeneratedUiBinding('panel-divider')?.asset, '011');
  assert.equal(realmGeneratedUiBinding('tavern-nameplate')?.asset, '015');
  assert.equal(realmGeneratedUiBinding('unknown'), null);
  assert.match(realmGeneratedUiUrl('4'), /frame-004\.webp$/);
  assert.ok(assets.every((asset) => asset.url.endsWith('.webp')));
});

test('ERP and CRM ornament catalog exposes twelve optimized medieval-enterprise bindings', () => {
  const assets = realmGeneratedErpUiAssets();
  assert.equal(assets.length, 12);
  assert.deepEqual(new Set(assets.map((asset) => asset.surface)), new Set(Object.keys(REALM_GENERATED_ERP_UI_BINDINGS)));
  assert.equal(realmGeneratedErpUiBinding('header-crest')?.asset, 'header-crest');
  assert.equal(realmGeneratedErpUiBinding('approval-seal')?.asset, 'approval-seal');
  assert.equal(realmGeneratedErpUiBinding('footer-flourish')?.asset, 'footer-flourish');
  assert.equal(realmGeneratedErpUiBinding('unknown'), null);
  assert.match(realmGeneratedErpUiUrl('table-finials'), /erp-ui-table-finials\.webp$/);
  assert.match(realmGeneratedErpUiUrl('unknown'), /erp-ui-manuscript-divider\.webp$/);
  assert.ok(assets.every((asset) => asset.url.includes('/erp-ui/elements-webp-v2/')));
});

test('business prop catalog exposes seven optimized deterministic bindings', () => {
  const assets = realmGeneratedPropAssets();
  assert.equal(assets.length, 7);
  assert.deepEqual(new Set(assets.map((asset) => asset.objectId)), new Set(Object.keys(REALM_GENERATED_PROP_BINDINGS)));
  assert.equal(realmGeneratedPropBinding('guild-roster')?.asset, '011');
  assert.equal(realmGeneratedPropBinding('realm-gate')?.proceduralUnderlay, true);
  assert.equal(realmGeneratedPropBinding('unknown'), null);
  assert.match(realmGeneratedPropUrl('4'), /prop-004\.webp$/);
  assert.ok(assets.every((asset) => asset.url.endsWith('.webp')));
});

test('map styles use presentation-only presets and a deduplicated decorative asset catalog', () => {
  assert.deepEqual(REALM_MAP_STYLES.map((style) => style.id), ['royal-office', 'emerald-court', 'lantern-festival']);
  assert.ok(REALM_MAP_STYLES.every((style) => style.decorations.length >= 20));
  assert.ok(REALM_MAP_STYLES.every((style) => new Set(style.decorations.map((item) => item.key)).size === style.decorations.length));
  assert.ok(REALM_MAP_STYLES.every((style) => style.decorations.every((item) => item.x > 0 && item.x < 58 && item.y > 0 && item.y < 36)));
  assert.equal(normalizeRealmMapStyle('emerald-court'), 'emerald-court');
  assert.equal(normalizeRealmMapStyle('unknown'), 'royal-office');
  assert.equal(realmMapStyle('lantern-festival').label, 'Lantern Festival');
  const assets = realmGeneratedDecorAssets();
  assert.equal(assets.length, 18);
  assert.equal(new Set(assets.map((asset) => asset.asset)).size, assets.length);
  assert.ok(assets.every((asset) => asset.url.endsWith('.webp')));
});

test('environment catalog exposes eight optimized materials with a safe threshold fallback', () => {
  const assets = realmGeneratedEnvironmentAssets();
  assert.equal(assets.length, 8);
  assert.deepEqual(assets.map((asset) => asset.material), [...REALM_GENERATED_ENVIRONMENT_MATERIALS]);
  assert.ok(assets.every((asset) => asset.url.endsWith('.webp')));
  assert.match(realmGeneratedEnvironmentUrl('guild'), /material-guild\.webp$/);
  assert.match(realmGeneratedEnvironmentUrl('unknown'), /material-threshold\.webp$/);
});

test('character asset catalog contains six complete four-direction sets', () => {
  const assets = realmGeneratedCharacterAssets();
  assert.equal(assets.length, 24);
  assert.equal(new Set(assets.map((asset) => asset.key)).size, 24);
  assert.deepEqual(
    [...new Set(assets.map((asset) => asset.direction))],
    [...REALM_GENERATED_DIRECTIONS],
  );
  assert.ok(assets.every((asset) => asset.url.endsWith('.png')));
});

test('identity maps deterministically to a bounded character slot and URL', () => {
  const first = realmGeneratedCharacterSlot('user-42');
  assert.equal(realmGeneratedCharacterSlot('user-42'), first);
  assert.ok(first >= 1 && first <= 6);
  assert.match(realmGeneratedCharacterUrl('user-42', 'left'), /character-0[1-6]-left\.png$/);
  assert.match(realmGeneratedCharacterKey('user-42', 'up'), /^0[1-6]:up$/);
  assert.match(realmGeneratedCharacterPortraitUrl('user-42'), /characters\/directions\/character-0[1-6]-down\.png$/);
});

test('movement delta resolves a stable top-down facing direction', () => {
  assert.equal(realmArtDirectionFromDelta(-1, 0), 'left');
  assert.equal(realmArtDirectionFromDelta(1, 0), 'right');
  assert.equal(realmArtDirectionFromDelta(0, -1), 'up');
  assert.equal(realmArtDirectionFromDelta(0, 1), 'down');
  assert.equal(realmArtDirectionFromDelta(0, 0, 'right'), 'right');
  assert.equal(realmArtDirectionFromDelta(Number.NaN, 0, 'invalid'), 'down');
});
