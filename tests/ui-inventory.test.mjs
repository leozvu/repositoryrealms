import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildUiInventory, renderInventoryArtifacts } from '../scripts/lib/ui-inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = buildUiInventory(root);

test('Phase 1 inventory parses the full UI and API surface', () => {
  assert.deepEqual(inventory.parseErrors, []);
  assert.ok(inventory.uiRoutes.length >= 50);
  assert.ok(inventory.apiRoutes.length >= 45);
  assert.ok(inventory.elements.length >= 350);
});

test('all generated element IDs are unique and stable-shaped', () => {
  const ids = inventory.elements.map((element) => element.elementId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^(route|component)\.[a-z0-9.-]+$/.test(id)));
});

test('critical ERP and Realm routes are present with expected auth boundaries', () => {
  const routes = new Map(inventory.uiRoutes.map((route) => [route.route, route]));
  assert.equal(routes.get('/dashboard')?.auth, 'authenticated');
  assert.equal(routes.get('/realm')?.auth, 'authenticated');
  assert.equal(routes.get('/realm-demo')?.auth, 'public');
  assert.deepEqual(routes.get('/realm')?.roles, ['DIRECTOR', 'PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD', 'STAFF']);
});

test('critical API contracts and generic resource bindings are discoverable', () => {
  const api = new Map(inventory.apiRoutes.map((route) => [route.route, route]));
  assert.ok(api.get('/api/data/[resource]')?.methods.includes('GET'));
  assert.ok(api.get('/api/data/[resource]')?.methods.includes('POST'));
  assert.ok(api.get('/api/realm-demo/operations')?.methods.includes('GET'));
  assert.ok(api.get('/api/realm-demo/operations')?.methods.includes('POST'));
  assert.deepEqual([...(api.get('/api/collaboration/presence')?.methods || [])].sort(), ['DELETE', 'GET', 'POST']);
  assert.deepEqual([...(api.get('/api/collaboration/contact')?.methods || [])].sort(), ['GET', 'PATCH', 'POST']);

  const dashboard = inventory.uiRoutes.find((route) => route.route === '/dashboard');
  assert.ok(dashboard.resourceCandidates.includes('tasks'));
  assert.ok(dashboard.resourceCandidates.includes('projects'));
  const routeTargets = new Set(inventory.uiRoutes.flatMap((route) => route.routeCandidates));
  assert.equal(routeTargets.size, 1);
  const loginTarget = [...routeTargets][0];
  assert.match(loginTarget, /preferredWorkspaceSurface/);
  assert.match(loginTarget, /'\/realm'/);
  assert.match(loginTarget, /'\/dashboard'/);
});

test('rendered artifacts are deterministic', () => {
  const first = renderInventoryArtifacts(inventory);
  const second = renderInventoryArtifacts(buildUiInventory(root));
  assert.deepEqual(second, first);
});
