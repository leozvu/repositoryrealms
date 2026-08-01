import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('Phase 1 product surfaces use canonical session and data sources', () => {
  const route = read('app/realm-v2/[[...area]]/page.jsx');
  const screens = read('components/realm-v2/CanonicalRealmScreens.jsx');
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /pilot\.allowed/);
  for (const endpoint of ['/api/execution/my-work', '/api/approvals', '/api/notifications']) assert.ok(screens.includes(endpoint));
  assert.ok(screens.includes('/api/execution/actions'));
  assert.ok(screens.includes("action: 'task.transition'"));
  assert.ok(screens.includes('expectedState: task.status'));
  assert.ok(screens.includes('RepositoryRealms đã ghi receipt'));
});

test('Phase 1 does not import preview fixtures into product shell or screens', () => {
  const product = `${read('components/realm-v2/RealmV2ApplicationShell.jsx')}\n${read('components/realm-v2/CanonicalRealmScreens.jsx')}`;
  assert.doesNotMatch(product, /realm-v2\/fixtures/);
  assert.doesNotMatch(product, /Preview fixtures/);
  assert.doesNotMatch(product, /Non-canonical/);
});

test('Phase 1 preserves ERP routes and provides the required five-item mobile navigation', () => {
  const appLayout = read('app/(app)/layout.jsx');
  const switcher = read('components/collaboration/CollaborationBridge.jsx');
  const shell = read('components/realm-v2/RealmV2ApplicationShell.jsx');
  assert.match(appLayout, /realmV2Theme=\{realmV2PreviewEnabled\(\)\}/);
  assert.match(appLayout, /realmV2Available=\{realmV2PreviewEnabled\(\)\}/);
  assert.match(switcher, /realmV2Available \? '\/realm-v2\/home' : '\/realm'/);
  assert.match(shell, /mobileDestinations\(\)\.map/);
  for (const label of ['Trang chủ', 'Việc tôi', 'Hành động', 'Hộp thư', 'Thêm']) assert.ok(shell.includes(label));
  assert.match(shell, /href="\/realm-v2\/home"/);
});
