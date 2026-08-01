import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('Phase 6 exposes World Map and CEO Terminal as Director-only product compositions', () => {
  const route = read('app/realm-v2/[[...area]]/page.jsx');
  assert.match(route, /'world-map', 'ceo-terminal'/);
  assert.match(route, /CanonicalRealmExecutiveScreen/);
  assert.match(route, /isDirector\(user\)/);
  assert.match(route, /redirect\('\/dashboard'\)/);
});

test('World Map composes canonical federation, dashboard and command sources with independent degradation', () => {
  const screen = read('components/realm-v2/CanonicalRealmExecutiveScreens.jsx');
  for (const endpoint of ['/api/ceo/v1/dashboard?entity=all', '/api/ceo/v1/federation/world?entity=all', '/api/ceo/v1/command-gateway?limit=50']) assert.ok(screen.includes(endpoint));
  assert.match(screen, /Promise\.allSettled/);
  assert.match(screen, /nguồn đang degrade độc lập/);
  assert.match(screen, /bảng công ty phía dưới là phiên bản truy cập tương đương/);
  assert.match(screen, /không phải điểm sức khỏe/);
  assert.match(screen, /Presence không dùng để chấm năng suất/);
});

test('World Map does not fabricate unavailable incidents or approval backlog', () => {
  const screen = read('components/realm-v2/CanonicalRealmExecutiveScreens.jsx');
  assert.match(screen, /Incident count chưa được contract expose/);
  assert.match(screen, /Approval backlog/);
  assert.match(screen, /Chưa được CEO snapshot contract expose/);
  assert.match(screen, /map không lưu business record/);
});

test('CEO Terminal keeps financial and operating meanings separate with provenance', () => {
  const screen = read('components/realm-v2/CanonicalRealmExecutiveScreens.jsx');
  assert.match(screen, /Cash revenue/);
  assert.match(screen, /Không phải recognized revenue/);
  assert.match(screen, /GMV không phải revenue/);
  assert.match(screen, /không phải accounting profit/);
  assert.match(screen, /Không suy ra capacity hoặc xếp hạng/);
  assert.match(screen, /Currency/);
  assert.match(screen, /As-of/);
  assert.match(screen, /Confidence/);
});

test('Phase 6 executive composition remains read-only and delegates workflows', () => {
  const screen = read('components/realm-v2/CanonicalRealmExecutiveScreens.jsx');
  for (const href of ['/ceo-world', '/ceo-overview', '/ceo-inbox', '/realm-v2/command-center', '/ceo-commands']) assert.ok(screen.includes(href));
  assert.doesNotMatch(screen, /fetch\([^\n]+method:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(screen, /localStorage.*(?:dashboard|world|command)/i);
  assert.match(screen, /authorization, business rules, receipt và audit chuẩn/);
});

test('Phase 6 visual harness is development-only and locks five breakpoints', () => {
  const route = read('app/realm-v2/phase-6-qa/page.jsx');
  const capture = read('scripts/capture-realm-v2-phase-6.mjs');
  assert.match(route, /process\.env\.NODE_ENV === 'production'/);
  assert.match(route, /notFound\(\)/);
  for (const viewport of ['desktop-1440', 'laptop-1024', 'tablet-768', 'phone-390', 'phone-375']) assert.ok(capture.includes(`name: '${viewport}'`));
  assert.match(capture, /mobileNavItems !== 5/);
  assert.match(capture, /horizontalOverflowPx/);
  assert.match(capture, /mutationRequests/);
  assert.match(capture, /url\.pathname\.startsWith\('\/api\/ceo\/v1\/'\)/);
});

test('Phase 6 handoff records canonical boundaries and evidence', () => {
  const handoff = read('docs/realms/design-system/PHASE-6-WORLD-MAP-CEO-TERMINAL.md');
  assert.match(handoff, /federation world, validated dashboard cache, command delivery ledger and authorized conversation cache/i);
  assert.match(handoff, /recognized revenue, accounting profit, approval backlog, incident registry and capacity are unavailable/i);
  assert.match(handoff, /does not dispatch commands, open SSO gateways, refresh caches or mutate records/i);
  assert.match(handoff, /No database mutation, commit, push, merge, or deployment/);
});
