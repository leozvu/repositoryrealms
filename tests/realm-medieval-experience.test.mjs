import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { translateUiCopy } from '../lib/i18n.js';

function source(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('the immersive world is the canonical Realm entrance', () => {
  const route = source('app/(app)/realm/page.jsx');
  const bridge = source('components/collaboration/CollaborationBridge.jsx');

  assert.match(route, /<RealmOffice/);
  assert.doesNotMatch(route, /redirect\('\/realm-v2\/home'\)/);
  assert.match(bridge, /const href = realm \? '\/dashboard' : '\/realm'/);
  assert.doesNotMatch(bridge, /realmV2Available \? '\/realm-v2\/home'/);
});

test('Realm surfaces expose the world, Gold economy and proximity voice without fake balances', () => {
  const appShell = source('components/realm-v2/RealmV2ApplicationShell.jsx');
  const screens = source('components/realm-v2/CanonicalRealmScreens.jsx');
  const erpShell = source('components/Shell.jsx');

  assert.match(appShell, /href="\/realm"/);
  assert.match(appShell, /href="\/realm-v2\/recognition"/);
  assert.match(appShell, /\/api\/realm-v2\/profile-recognition/);
  assert.match(appShell, /LanguageSwitch compact/);
  assert.match(screens, /realmAvatarMarker/);
  assert.match(screens, /voice theo khoảng cách/);
  assert.match(erpShell, /shell-gold-balance/);
  assert.match(erpShell, /goldBalance == null \? 'Gold'/);
  assert.doesNotMatch(erpShell, /goldBalance[^\n]+\?\?\s*\d/);
});

test('the medieval visual system uses repository assets and remains motion-accessible', () => {
  const layout = source('app/layout.jsx');
  const css = source('components/realm-v2/realm-v2.module.css');

  assert.match(layout, /Cormorant_Garamond/);
  assert.match(layout, /--font-realm-display/);
  assert.match(css, /realm-office-master-map-v1\.png/);
  assert.match(css, /character-01-down\.png/);
  assert.match(css, /\.realmPortal/);
  assert.match(css, /\.goldBalance/);
  assert.match(css, /prefers-reduced-motion/);
});

test('new medieval Realm copy switches fully between Vietnamese and English', () => {
  const copy = {
    'Đại sảnh Realm': 'Realm Great Hall',
    'Bước vào Realm': 'Enter Realm',
    'Realm đang sống': 'Living Realm',
    'Bản đồ Đại sảnh': 'Great Hall map',
    'Kho bạc Gold': 'Gold Treasury',
    'Nhân vật, hiện diện và voice theo khoảng cách': 'Characters, presence, and proximity voice',
  };

  for (const [vietnamese, english] of Object.entries(copy)) {
    assert.equal(translateUiCopy(vietnamese, 'en'), english, vietnamese);
    assert.equal(translateUiCopy(vietnamese, 'vi'), vietnamese, vietnamese);
  }
});
