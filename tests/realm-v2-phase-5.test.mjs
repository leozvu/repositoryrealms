import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('Phase 5 exposes Project Realm and Chronicle as authenticated product compositions', () => {
  const route = read('app/realm-v2/[[...area]]/page.jsx');
  assert.match(route, /'projects', 'chronicle'/);
  assert.match(route, /CanonicalRealmProjectChronicleScreen/);
  assert.match(route, /currentUser\(\)/);
  assert.match(route, /pilot\.allowed/);
});

test('Project Realm composes canonical ERP Project and execution-health sources without writes', () => {
  const screen = read('components/realm-v2/CanonicalRealmProjectChronicleScreens.jsx');
  for (const endpoint of ['/api/data/projects', '/api/projects/stats', '/execution-health']) assert.ok(screen.includes(endpoint));
  assert.match(screen, /Promise\.allSettled/);
  assert.match(screen, /Danh sách và health degrade độc lập/);
  assert.match(screen, /Planning proxy, không phải accounting profit/);
  assert.match(screen, /không xếp hạng hiệu suất/);
  assert.doesNotMatch(screen, /fetch\([^\n]+method:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(screen, /localStorage.*project/i);
});

test('Project Realm preserves ERP workflows and refuses to invent unavailable project context', () => {
  const screen = read('components/realm-v2/CanonicalRealmProjectChronicleScreens.jsx');
  assert.match(screen, /href={`\/projects\/\$\{encodeURIComponent\(selectedId\)\}`}/);
  assert.match(screen, /href="\/tasks"/);
  assert.match(screen, /Milestone chi tiết/);
  assert.match(screen, /Project owner/);
  assert.match(screen, /Không tự suy đoán audit trail/);
});

test('Chronicle is a Director-authorized read-only view over ERP AuditLog', () => {
  const screen = read('components/realm-v2/CanonicalRealmProjectChronicleScreens.jsx');
  const api = read('app/api/audit/route.js');
  assert.match(screen, /fetch\('\/api\/audit'/);
  assert.match(api, /isDirector\(user\)/);
  assert.match(screen, /Chronicle này là AuditLog ERP chỉ đọc/);
  assert.match(screen, /Chưa được `\/api\/audit` expose/);
  assert.match(screen, /Correction phải tạo event liên kết mới/);
  assert.match(screen, /disabled title="Chưa có signed-export contract"/);
  assert.doesNotMatch(screen, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
});

test('Phase 5 visual harness is development-only and locks five breakpoints', () => {
  const route = read('app/realm-v2/phase-5-qa/page.jsx');
  const capture = read('scripts/capture-realm-v2-phase-5.mjs');
  assert.match(route, /process\.env\.NODE_ENV === 'production'/);
  assert.match(route, /notFound\(\)/);
  for (const viewport of ['desktop-1440', 'laptop-1024', 'tablet-768', 'phone-390', 'phone-375']) assert.ok(capture.includes(`name: '${viewport}'`));
  assert.match(capture, /mobileNavItems !== 5/);
  assert.match(capture, /horizontalOverflowPx/);
  assert.match(capture, /mutationRequests/);
  assert.match(capture, /window\.scrollTo/);
});

test('Phase 5 handoff records canonical boundaries, authorization and visual evidence', () => {
  const handoff = read('docs/realms/design-system/PHASE-5-PROJECT-REALM-CHRONICLE.md');
  assert.match(handoff, /canonical `Project`, `Task`, `TimeLog`, `Phase`, `WorkQueueState`, `VendorBill`, and `Invoice`/i);
  assert.match(handoff, /organization Chronicle is a Director-only read surface over canonical ERP `AuditLog`/i);
  assert.match(handoff, /does not invent before\/after values, event sources, signed exports, correction links, or RepositoryRealms receipts/i);
  assert.match(handoff, /No database mutation, commit, push, merge, or deployment/);
});
