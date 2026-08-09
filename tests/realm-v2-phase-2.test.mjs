import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('Phase 2 exposes Work Management and Action Center as authenticated product compositions', () => {
  const route = read('app/realm-v2/[[...area]]/page.jsx');
  assert.match(route, /'work-management', 'action-center'/);
  assert.match(route, /CanonicalRealmOperationsScreen/);
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /pilot\.allowed/);
});

test('Work Management uses canonical Team Work and registered RepositoryRealms task actions', () => {
  const screen = read('components/realm-v2/CanonicalRealmOperationsScreens.jsx');
  assert.ok(screen.includes('/api/execution/team-work'));
  assert.ok(screen.includes('/api/execution/actions'));
  for (const action of ["action: 'task.transition'", "action: 'task.block'", "action: 'task.unblock'", "action: 'task.escalate'"]) assert.ok(screen.includes(action));
  assert.ok(screen.includes("'Idempotency-Key': idempotencyKey"));
  assert.ok(screen.includes('payload.repository?.receiptId'));
  assert.doesNotMatch(screen, /realm-v2\/fixtures/);
});

test('Action Center fails closed for unregistered approval decisions', () => {
  const screen = read('components/realm-v2/CanonicalRealmOperationsScreens.jsx');
  assert.match(screen, /`approval\.decide` chưa nằm trong allowlist/);
  assert.match(screen, /Mở phê duyệt ERP/);
  assert.doesNotMatch(screen, /fetch\(`\/api\/approvals\/\$\{[^}]+\}\/decide`/);
  assert.doesNotMatch(screen, /action:\s*'approval\.decide'/);
});

test('Phase 2 implements board, queue, timeline and workload without employee ranking', () => {
  const screen = read('components/realm-v2/CanonicalRealmOperationsScreens.jsx');
  for (const view of ['board', 'queue', 'timeline', 'workload']) assert.ok(screen.includes(`value: '${view}'`));
  assert.match(screen, /không phải điểm năng suất hay xếp hạng nhân sự/);
  assert.match(screen, /Employee ranking: tắt theo policy/);
});

test('Phase 2 visual harness is development-only and validates mobile navigation', () => {
  const qaRoute = read('app/realm-v2/phase-2-qa/page.jsx');
  const capture = read('scripts/capture-realm-v2-phase-2.mjs');
  assert.match(qaRoute, /process\.env\.NODE_ENV === 'production'/);
  assert.match(qaRoute, /notFound\(\)/);
  assert.match(capture, /mobileNavItems !== 5/);
  assert.match(capture, /horizontalOverflowPx/);
  assert.match(capture, /directApproveButtonCount/);
  for (const viewport of ['desktop-1440', 'laptop-1024', 'tablet-768', 'phone-390', 'phone-375']) assert.ok(capture.includes(`name: '${viewport}'`));
});

test('Phase 2 handoff documents canonical boundaries and QA evidence', () => {
  const handoff = read('docs/realms/design-system/PHASE-2-WORK-MANAGEMENT-ACTION-CENTER.md');
  assert.match(handoff, /RepositoryRealms/);
  assert.match(handoff, /approval\.decide/);
  assert.match(handoff, /10\/10/);
  assert.match(handoff, /not committed, pushed or deployed/i);
});
