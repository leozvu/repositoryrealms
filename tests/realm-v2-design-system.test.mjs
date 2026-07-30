import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  advanceCommand,
  canonicalAreaHref,
  canTransitionCommand,
  mobileDestinations,
  REALM_V2_AREAS,
  realmV2PreviewEnabled,
  resolveDisplayState,
} from '../lib/realm-v2-contracts.js';

test('Realm v2 coverage contract contains all 18 unique product areas', () => {
  assert.equal(REALM_V2_AREAS.length, 18);
  assert.equal(new Set(REALM_V2_AREAS.map(area => area.slug)).size, 18);
  for (const area of REALM_V2_AREAS) {
    assert.ok(area.label);
    assert.ok(area.labelVi);
    assert.ok(area.template);
    assert.ok(area.group);
    assert.match(area.canonicalPath, /^\//);
  }
});

test('Realm v2 product entries resolve to canonical ERP and Realm workflows', () => {
  assert.equal(canonicalAreaHref('home'), '/dashboard');
  assert.equal(canonicalAreaHref('my-work'), '/myday');
  assert.equal(canonicalAreaHref('work-management'), '/tasks');
  assert.equal(canonicalAreaHref('projects'), '/projects');
  assert.equal(canonicalAreaHref('approvals'), '/approvals');
  assert.equal(canonicalAreaHref('settings'), '/settings');
  assert.equal(canonicalAreaHref('chronicle'), '/realm');
  assert.equal(canonicalAreaHref('missing'), '/dashboard');
});

test('mobile contract exposes exactly five labeled destinations in required order', () => {
  assert.deepEqual(mobileDestinations().map(item => item.label), ['Home', 'My Work', 'Actions', 'Inbox', 'More']);
});

test('command lifecycle separates proposal, approval, execution and confirmation', () => {
  assert.equal(canTransitionCommand('draft', 'proposed'), true);
  assert.equal(canTransitionCommand('proposed', 'executing'), false);
  assert.throws(() => advanceCommand({ state: 'proposed' }, 'pending_approval'), /Authorization/);
  const pending = advanceCommand({ state: 'proposed' }, 'pending_approval', { authorizationChecked: true, updatedAt: '2026-07-29T10:00:00Z' });
  assert.equal(pending.state, 'pending_approval');
  assert.throws(() => advanceCommand({ state: 'executing' }, 'confirmed'), /receipt/);
  const confirmed = advanceCommand({ state: 'executing' }, 'confirmed', { receiptId: 'RR-TEST-01', auditHref: '/chronicle/RR-TEST-01', updatedAt: '2026-07-29T10:01:00Z' });
  assert.equal(confirmed.state, 'confirmed');
  assert.equal(confirmed.receiptId, 'RR-TEST-01');
});

test('display resilience precedence never masks authorization or offline failures with empty state', () => {
  assert.equal(resolveDisplayState({ loading: true, denied: true, empty: true }), 'loading');
  assert.equal(resolveDisplayState({ denied: true, offline: true, empty: true }), 'permission-denied');
  assert.equal(resolveDisplayState({ offline: true, stale: true, empty: true }), 'offline');
  assert.equal(resolveDisplayState({ stale: true, empty: true }), 'stale');
  assert.equal(resolveDisplayState({ empty: true }), 'empty');
  assert.equal(resolveDisplayState({}), 'ready');
});

test('preview route is denied in production unless explicitly enabled', () => {
  assert.equal(realmV2PreviewEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(realmV2PreviewEnabled({ NODE_ENV: 'production', REALM_V2_PREVIEW: 'true' }), true);
  assert.equal(realmV2PreviewEnabled({ NODE_ENV: 'test' }), true);
});

test('token stylesheet defines semantic contract and accessibility hooks', () => {
  const css = fs.readFileSync(path.resolve('components/realm-v2/realm-v2.module.css'), 'utf8');
  for (const token of ['--r2-canvas', '--r2-surface-1', '--r2-emerald', '--r2-gold', '--r2-text', '--r2-focus']) assert.match(css, new RegExp(token));
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('canonical theme bridges Realm v2 tokens onto the existing ERP shell', () => {
  const css = fs.readFileSync(path.resolve('app/realm-canonical-v2.css'), 'utf8');
  const layout = fs.readFileSync(path.resolve('app/(app)/layout.jsx'), 'utf8');
  const shell = fs.readFileSync(path.resolve('components/Shell.jsx'), 'utf8');
  const route = fs.readFileSync(path.resolve('app/realm-v2/[[...area]]/page.jsx'), 'utf8');

  assert.match(css, /repository-realms-v2-workspace/);
  assert.match(css, /--r2-canvas/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(layout, /realmV2PreviewEnabled\(\)/);
  assert.match(shell, /repository-realms-workspace.*repository-realms-v2-workspace/s);
  assert.match(shell, /data-visual-upgrade/);
  assert.match(route, /redirect\(canonicalAreaHref\(slug\)\)/);
  assert.doesNotMatch(route, /RealmV2Shell/);
});
