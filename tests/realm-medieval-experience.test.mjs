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

test('Reforged Guildhall makes the spatial world primary without replacing business capabilities', () => {
  const office = source('components/realm/RealmOffice.jsx');
  const scene = source('components/realm/GuildhallScene.jsx');
  const motion = source('components/realm/LivingGuildhallMotion.jsx');
  const remotion = source('components/realm/GuildhallRemotion.jsx');
  const css = source('components/realm/guildhall-shell.module.css');
  const manifest = JSON.parse(source('package.json'));

  assert.match(office, /<GuildhallScene/);
  assert.match(office, /Guildhall của đội ngũ/);
  assert.match(office, /<MediaDock/);
  assert.match(office, /<LedgerMode/);
  assert.match(office, /setLedgerView\('personal'\)/);
  assert.match(office, /data-realm-ledger-root/);
  assert.match(office, /data-realm-ledger-tabs/);
  assert.match(office, /data-realm-ledger-section/);
  assert.match(office, /RoyalTreasuryExchange/);
  assert.match(office, /RewardControlCenter/);
  assert.match(office, /useProximityMedia/);
  assert.match(scene, /guildhall-environment\.png/);
  assert.match(scene, /GuildhallAtmosphere/);
  assert.match(scene, /RealmActorMotion/);
  assert.match(scene, /isInVoiceRange/);
  assert.match(scene, /realmGeneratedCharacterUrl/);
  assert.match(scene, /realmGeneratedCharacterArchetype/);
  assert.match(scene, /window\.addEventListener\('realm:move'/);
  assert.match(scene, /'arrowup'.*'w'.*'s'.*'d'/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /ScrollTrigger/);
  assert.match(css, /\.commandBar/);
  assert.match(css, /\.scenePlate/);
  assert.match(css, /\.sceneOcclusion/);
  assert.match(css, /\.actorContactShadow/);
  assert.match(css, /\.actionDock/);
  assert.match(css, /\.surface/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.equal(manifest.dependencies.gsap, '^3.15.0');
  assert.equal(manifest.dependencies['@gsap/react'], '^2.1.2');
  assert.equal(manifest.dependencies.remotion, '^4.0.508');
  assert.equal(manifest.dependencies['@remotion/player'], '^4.0.508');
  assert.match(remotion, /from '@remotion\/player'/);
  assert.match(remotion, /useCurrentFrame/);
  assert.match(remotion, /autoPlay=\{!reducedMotion\}/);
  assert.match(remotion, /numberOfSharedAudioTags=\{0\}/);
  assert.match(remotion, /LivingEnvironmentComposition/);
  assert.match(remotion, /ActorComposition/);
  const generatedArt = source('lib/realm-generated-art.js');
  assert.match(generatedArt, /High Elf/);
  assert.match(generatedArt, /Dwarf/);
  assert.match(generatedArt, /Moon Elf/);
  assert.match(generatedArt, /Halfling/);
  assert.match(generatedArt, /Half-Orc/);
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

test('Living Guildhall and Workbench copy switches without translating business records', () => {
  const copy = {
    'Bàn công việc': 'Workbench',
    'Phòng điều hành': 'Operations Room',
    'Kho bạc Realm': 'Realm Treasury',
    'Gold của bạn': 'Your Gold',
    'Sơ đồ không gian làm việc': 'Workplace map',
    'đang có mặt': 'present',
    '· Duyệt bởi': '· Reviewed by',
  };

  for (const [vietnamese, english] of Object.entries(copy)) {
    assert.equal(translateUiCopy(vietnamese, 'en'), english, vietnamese);
    assert.equal(translateUiCopy(vietnamese, 'vi'), vietnamese, vietnamese);
  }

  const office = source('components/realm/RealmOffice.jsx');
  assert.match(office, /<h3 data-no-i18n>\{quest\.title\}<\/h3>/);
  assert.match(office, /<span data-no-i18n>\{quest\.project\}<\/span>/);
  assert.match(office, /<span data-no-i18n>\{quest\.reviewer\}<\/span>/);
});
