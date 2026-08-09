import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('Phase 7 exposes Employee Profile and Recognition as authenticated product compositions', () => {
  const route = read('app/realm-v2/[[...area]]/page.jsx');
  assert.match(route, /'employee-profile', 'recognition'/);
  assert.match(route, /CanonicalRealmPeopleRecognitionScreen/);
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /pilot\.allowed/);
});

test('Phase 7 reads one canonical self-scoped API and never mutates business records', () => {
  const screen = read('components/realm-v2/CanonicalRealmPeopleRecognitionScreens.jsx');
  assert.match(screen, /\/api\/realm-v2\/profile-recognition/);
  assert.match(screen, /credentials: 'same-origin'/);
  assert.doesNotMatch(screen, /fetch\([^\n]+method:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(screen, /from '.\/fixtures'/);
  assert.match(screen, /Mở Hội đồng Gold/);
  assert.match(screen, /workflow quản trị hiện có giữ maker\/checker, budget và idempotency/i);
});

test('Employee Profile makes privacy, evidence gaps and non-ranking boundary explicit', () => {
  const screen = read('components/realm-v2/CanonicalRealmPeopleRecognitionScreens.jsx');
  for (const copy of ['Không tải lương', 'Chưa liên kết bằng chứng', 'không phải bảng xếp hạng nhân sự', 'không có ranking hoặc suy luận cảm xúc']) assert.ok(screen.includes(copy));
  for (const tab of ['Tổng quan', 'Công việc', 'Kỹ năng', 'Dự án', 'Ghi nhận', 'Chronicle', 'Tùy chọn']) assert.ok(screen.includes(tab));
  assert.match(screen, /Múi giờ/);
  assert.match(screen, /ERP chưa lưu/);
});

test('Recognition ledger exposes source, policy, approver, receipt and compensating corrections', () => {
  const screen = read('components/realm-v2/CanonicalRealmPeopleRecognitionScreens.jsx');
  for (const label of ['Nguồn', 'Người duyệt', 'Policy', 'Canonical receipt', 'Bút toán điều chỉnh']) assert.ok(screen.includes(label));
  assert.match(screen, /Append-only/);
  assert.match(screen, /compensating entry/);
  assert.match(screen, /không đổi lương, phép, cấp bậc hay thứ hạng nhân sự/);
  assert.match(screen, /không leaderboard, streak, scarcity badge hoặc reward shop/);
});

test('Phase 7 route preserves server authorization and private no-store response policy', () => {
  const route = read('app/api/realm-v2/profile-recognition/route.js');
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /realmSurfaceDecision\(user, 'personal'/);
  assert.match(route, /isFreelancer\(user\)/);
  assert.match(route, /realmJsonResponse/);
  assert.match(route, /loadRealmProfileRecognition/);
});

test('Phase 7 visual harness is development-only and locks five breakpoints', () => {
  const route = read('app/realm-v2/phase-7-qa/page.jsx');
  const capture = read('scripts/capture-realm-v2-phase-7.mjs');
  assert.match(route, /process\.env\.NODE_ENV === 'production'/);
  assert.match(route, /notFound\(\)/);
  for (const viewport of ['desktop-1440', 'laptop-1024', 'tablet-768', 'phone-390', 'phone-375']) assert.ok(capture.includes(`name: '${viewport}'`));
  assert.match(capture, /mobileNavItems !== 5/);
  assert.match(capture, /horizontalOverflowPx/);
  assert.match(capture, /mutationRequests/);
});

test('Phase 7 handoff records canonical boundaries and verification evidence', () => {
  const handoff = read('docs/realms/design-system/PHASE-7-EMPLOYEE-PROFILE-RECOGNITION-LEDGER.md');
  assert.match(handoff, /User, Task, Project, CollaborationPresenceSession, RealmGoldEntry and RealmRewardBudget/i);
  assert.match(handoff, /Gold does not change payroll, statutory leave, rank or employee score/i);
  assert.match(handoff, /does not create, approve, correct or delete a Gold entry/i);
  assert.match(handoff, /No database mutation, commit, push, merge, or deployment/);
});
