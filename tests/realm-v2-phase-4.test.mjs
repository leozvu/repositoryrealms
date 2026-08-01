import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('Phase 4 exposes Unified Inbox and Collaboration as authenticated product compositions', () => {
  const route = read('app/realm-v2/[[...area]]/page.jsx');
  assert.match(route, /'inbox', 'collaboration'/);
  assert.match(route, /CanonicalRealmCommunicationScreen/);
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /pilot\.allowed/);
});

test('Unified Inbox reuses canonical ERP Chat and Notification routes', () => {
  const screen = read('components/realm-v2/CanonicalRealmCommunicationScreens.jsx');
  for (const endpoint of ['/api/chat', '/api/notifications']) assert.ok(screen.includes(endpoint));
  assert.match(screen, /fetch\(`\/api\/chat\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(screen, /method: 'PUT'/);
  assert.match(screen, /Message record đã được lưu/);
  assert.match(screen, /Realm không giữ bản sao hội thoại/);
  assert.doesNotMatch(screen, /localStorage.*message/i);
});

test('Unified Inbox degrades sources independently and does not invent missing context', () => {
  const screen = read('components/realm-v2/CanonicalRealmCommunicationScreens.jsx');
  assert.match(screen, /Promise\.allSettled/);
  assert.match(screen, /Một nguồn Inbox đang gián đoạn/);
  assert.match(screen, /API hiện chưa expose/);
  assert.match(screen, /Realm không tự gắn Project hoặc Task/);
});

test('Collaboration uses voluntary TTL presence and idempotent contact records', () => {
  const screen = read('components/realm-v2/CanonicalRealmCommunicationScreens.jsx');
  for (const endpoint of ['/api/collaboration/presence', '/api/collaboration/contact']) assert.ok(screen.includes(endpoint));
  assert.match(screen, /rememberCollaborationAvailability/);
  assert.match(screen, /realm-v2-contact:\$\{crypto\.randomUUID\(\)\}/);
  assert.match(screen, /'Idempotency-Key': idempotencyKey/);
  assert.match(screen, /Không hiển thị raw heartbeat, thời lượng online, Task, Gold hoặc điểm hiệu suất/);
  assert.match(screen, /Co-viewing.*không được giả lập/);
  assert.doesNotMatch(screen, /scrollIntoView/);
});

test('Phase 4 visual harness is development-only and locks five breakpoints', () => {
  const route = read('app/realm-v2/phase-4-qa/page.jsx');
  const capture = read('scripts/capture-realm-v2-phase-4.mjs');
  assert.match(route, /process\.env\.NODE_ENV === 'production'/);
  assert.match(route, /notFound\(\)/);
  for (const viewport of ['desktop-1440', 'laptop-1024', 'tablet-768', 'phone-390', 'phone-375']) assert.ok(capture.includes(`name: '${viewport}'`));
  assert.match(capture, /mobileNavItems !== 5/);
  assert.match(capture, /horizontalOverflowPx/);
  assert.match(capture, /surveillanceCopyVisible/);
  assert.match(capture, /window\.scrollTo/);
});

test('Phase 4 handoff records canonical boundaries, degradation and privacy', () => {
  const handoff = read('docs/realms/design-system/PHASE-4-UNIFIED-INBOX-COLLABORATION.md');
  assert.match(handoff, /authorized ERP `Conversation` and `Notification` records/i);
  assert.match(handoff, /does \*\*not\*\* currently issue a separate RepositoryRealms receipt/);
  assert.match(handoff, /degrade independently/);
  assert.match(handoff, /never exposes raw heartbeats, online duration, Tasks, Gold, mood, or performance scores/);
  assert.match(handoff, /No database mutation, commit, push, merge, or deployment/);
});
