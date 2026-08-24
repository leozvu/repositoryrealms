import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('Phase 8 exposes all four final areas as authenticated product compositions', () => {
  const route = read('app/realm-v2/[[...area]]/page.jsx');
  assert.match(route, /\['notifications', 'search', 'settings', 'mobile'\]\.includes\(slug\)/);
  assert.match(route, /CanonicalRealmExperienceScreen/);
  assert.match(route, /REALM_V2_AREAS\.some\(area => area\.slug === slug\)/);
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /pilot\.allowed/);
});

test('Notifications uses the self-scoped canonical API and only writes read state', () => {
  const screen = read('components/realm-v2/CanonicalRealmExperienceScreens.jsx');
  assert.match(screen, /fetch\('\/api\/notifications'.*cache: 'no-store'.*credentials: 'same-origin'/s);
  assert.match(screen, /method: 'PUT'/);
  assert.match(screen, /body: JSON\.stringify\(id \? \{ id \} : \{ all: true \}\)/);
  assert.match(screen, /Tắt tiếng, snooze và rule cá nhân chưa có canonical contract/);
  assert.doesNotMatch(screen, /method: ['"](?:POST|PATCH|DELETE)['"].*\/api\/notifications/s);
});

test('Search shares the ERP contract, respects API authorization and never executes commands', () => {
  const screen = read('components/realm-v2/CanonicalRealmExperienceScreens.jsx');
  const contract = read('lib/global-search-contract.js');
  const shell = read('components/Shell.jsx');
  assert.match(screen, /GLOBAL_SEARCH_GROUPS/);
  assert.match(shell, /GLOBAL_SEARCH_GROUPS/);
  assert.match(screen, /\/api\/data\/\$\{group\.res\}/);
  assert.match(screen, /ArrowDown/);
  assert.match(screen, /ArrowUp/);
  assert.match(screen, /event\.key === 'Enter'/);
  assert.match(screen, /Đề xuất tác vụ/);
  assert.match(screen, /không thực thi lệnh ngầm/i);
  assert.match(contract, /realmRecordHref/);
});

test('Settings separates local presentation, audited preference and ERP governance', () => {
  const screen = read('components/realm-v2/CanonicalRealmExperienceScreens.jsx');
  assert.match(screen, /realm-v2-density/);
  assert.match(screen, /realm-v2-reduced-motion/);
  assert.match(screen, /rememberCollaborationAvailability/);
  assert.match(screen, /fetch\('\/api\/realm-demo\/pilot'.*method: 'PUT'/s);
  assert.match(screen, /href="\/settings"/);
  assert.match(screen, /Local: language, density, reduced motion, presence\. Audited: workspace preference\. ERP-only: governance and security/);
  assert.doesNotMatch(screen, /fetch\('\/api\/settings'/);
});

test('Mobile Realm is priority-first and reads the same self-scoped records', () => {
  const screen = read('components/realm-v2/CanonicalRealmExperienceScreens.jsx');
  assert.match(screen, /\/api\/realm-v2\/profile-recognition/);
  assert.match(screen, /\/api\/notifications/);
  for (const copy of ['Đang ưu tiên', 'Tiếp theo', 'Hành động', 'Thông báo', 'Tìm kiếm', 'Cài đặt', 'Mở ERP · CRM']) assert.ok(screen.includes(copy));
  assert.match(screen, /Mobile không nén menu desktop/);
  assert.match(screen, /Không có mobile business store riêng/);
});

test('Phase 8 responsive styling preserves touch, safe motion and no compressed desktop assumptions', () => {
  const css = read('components/realm-v2/realm-v2.module.css');
  assert.match(css, /\.experienceNotification/);
  assert.match(css, /\.searchLayout/);
  assert.match(css, /\.settingsLayout/);
  assert.match(css, /\.mobileExperience/);
  assert.match(css, /data-realm-reduced-motion/);
  assert.match(css, /@media \(max-width: 640px\)/);
});

test('Phase 8 visual harness is development-only and locks twenty responsive views', () => {
  const route = read('app/realm-v2/phase-8-qa/page.jsx');
  const capture = read('scripts/capture-realm-v2-phase-8.mjs');
  assert.match(route, /process\.env\.NODE_ENV === 'production'/);
  assert.match(route, /notFound\(\)/);
  for (const screen of ['notifications', 'search', 'settings', 'mobile']) assert.ok(capture.includes(`'${screen}'`));
  for (const viewport of ['desktop-1440', 'laptop-1024', 'tablet-768', 'phone-390', 'phone-375']) assert.ok(capture.includes(`name: '${viewport}'`));
  assert.match(capture, /mobileNavItems !== 5/);
  assert.match(capture, /horizontalOverflowPx/);
  assert.match(capture, /businessMutationRequests/);
});

test('Phase 8 final handoff records canonical boundaries and the 18-area completion claim', () => {
  const handoff = read('docs/realms/design-system/PHASE-8-FINAL-EXPERIENCE-COMPLETION.md');
  assert.match(handoff, /all 18 registered product areas/i);
  assert.match(handoff, /Notification, authorized ERP data APIs, Realm pilot preference, User, Task and Collaboration Presence/i);
  assert.match(handoff, /historical Phase 0 baseline/i);
  assert.match(handoff, /No database mutation, commit, push, merge, or deployment/);
});
