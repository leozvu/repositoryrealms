import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('Phase 3 exposes Command Center and Approvals as authenticated product compositions', () => {
  const route = read('app/realm-v2/[[...area]]/page.jsx');
  assert.match(route, /'command-center', 'approvals'/);
  assert.match(route, /CanonicalRealmGovernanceScreen/);
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /pilot\.allowed/);
});

test('Command Center separates local proposal structuring from RepositoryRealms dispatch', () => {
  const screen = read('components/realm-v2/CanonicalRealmGovernanceScreens.jsx');
  assert.match(screen, /Proposal mới chỉ được cấu trúc cục bộ/);
  assert.match(screen, /fetch\('\/api\/ceo\/v1\/command-gateway'/);
  for (const action of ['task.create', 'status.request', 'announcement.send', 'approval.request']) assert.ok(screen.includes(`'${action}'`));
  assert.match(screen, /idempotencyKey: `realm-v2-command:/);
  assert.match(screen, /correlationId: `realm-v2-correlation:/);
  assert.match(screen, /delivery\.status === 'delivered' && delivery\.receipt\?\.id/);
  assert.match(screen, /Chưa có canonical receipt\. Không tự gửi lại/);
});

test('Command Center uses canonical CEO registry, identity and reconciliation boundaries', () => {
  const screen = read('components/realm-v2/CanonicalRealmGovernanceScreens.jsx');
  for (const endpoint of ['/api/ceo/v1/registry', '/api/ceo/v1/identity/session', '/api/ceo/v1/command-gateway?limit=50']) assert.ok(screen.includes(endpoint));
  assert.match(screen, /\/reconcile`/);
  assert.match(screen, /CEO session chưa hoàn tất step-up/);
  assert.match(screen, /Finance và Payroll không nằm trong Command Center allowlist/);
});

test('Realm Approvals is canonical read-only and fails closed for decisions', () => {
  const screen = read('components/realm-v2/CanonicalRealmGovernanceScreens.jsx');
  assert.match(screen, /fetch\('\/api\/approvals'/);
  assert.match(screen, /Mở quyết định trong ERP/);
  assert.match(screen, /`approval\.decide` chưa có contract chung/);
  assert.doesNotMatch(screen, /fetch\(`\/api\/approvals\/\$\{[^}]+\}\/decide`/);
  assert.doesNotMatch(screen, /action:\s*'approval\.decide'/);
});

test('Phase 3 visual harness is development-only and locks five breakpoints', () => {
  const qaRoute = read('app/realm-v2/phase-3-qa/page.jsx');
  const capture = read('scripts/capture-realm-v2-phase-3.mjs');
  assert.match(qaRoute, /process\.env\.NODE_ENV === 'production'/);
  assert.match(qaRoute, /notFound\(\)/);
  for (const viewport of ['desktop-1440', 'laptop-1024', 'tablet-768', 'phone-390', 'phone-375']) assert.ok(capture.includes(`name: '${viewport}'`));
  assert.match(capture, /mobileNavItems !== 5/);
  assert.match(capture, /horizontalOverflowPx/);
  assert.match(capture, /directApproveButtonCount/);
});

test('Phase 3 handoff documents the canonical action and approval safety boundaries', () => {
  const handoff = read('docs/realms/design-system/PHASE-3-COMMAND-CENTER-APPROVALS.md');
  assert.match(handoff, /target entity executes through RepositoryRealms/);
  assert.match(handoff, /never resends the business action automatically/);
  assert.match(handoff, /no direct Approve or Reject control exists in Realm/);
  assert.match(handoff, /10\/10 successful screen captures/);
});
