import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildUiInventory } from '../scripts/lib/ui-inventory.mjs';
import { buildUiActionMap, renderActionMapArtifacts } from '../scripts/lib/ui-action-map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = buildUiInventory(root);
const actionMap = buildUiActionMap(root);

test('Phase 2 preserves one action-map row for every Phase 1 element', () => {
  assert.deepEqual(actionMap.parseErrors, []);
  assert.equal(actionMap.actions.length, inventory.elements.length);
  assert.deepEqual(actionMap.actions.map((action) => action.elementId), inventory.elements.map((element) => element.elementId));
});

test('registry policies expose concrete Prisma models and server RBAC', () => {
  const tasks = actionMap.resourcePolicies.tasks;
  assert.equal(tasks.model, 'Task');
  assert.ok(tasks.readRoles.includes('STAFF'));
  assert.ok(tasks.writeRoles.includes('DIRECTOR'));
  assert.equal(tasks.rowPolicy, true);

  const payouts = actionMap.resourcePolicies.payouts;
  assert.equal(payouts.model, 'Payout');
  assert.equal(payouts.rowPolicy, true);
});

test('generic CRUD and Realm dedicated contracts are both discoverable', () => {
  const contracts = new Map(actionMap.apiContracts.map((contract) => [contract.route, contract]));
  assert.equal(contracts.get('/api/data/[resource]')?.methods.POST.permissionPolicy, 'registry-rbac');
  assert.ok(contracts.get('/api/data/[resource]')?.methods.POST.guards.includes('canWrite'));
  assert.ok(contracts.get('/api/realm-demo/operations')?.methods.POST.models.length >= 1);
  assert.notEqual(contracts.get('/api/realm-demo/operations')?.methods.POST.permissionPolicy, 'public-or-unverified');
  assert.equal(contracts.get('/api/v1/summary')?.methods.GET.permissionPolicy, 'explicit-rbac');
  assert.ok(contracts.get('/api/v1/summary')?.methods.GET.guards.includes('apiUser'));
});

test('data actions resolve to an API or resource operation with a permission boundary', () => {
  const dataActions = actionMap.actions.filter((action) => action.actionType === 'data-action');
  assert.ok(dataActions.length >= 25);
  assert.ok(dataActions.every((action) => action.apiCalls.length || action.resourceOperations.length));
  assert.ok(dataActions.some((action) => action.resourceOperations.includes('update:tasks')));
  assert.ok(dataActions.some((action) => action.apiCalls.some((call) => call.includes('/api/realm-demo/rewards'))));
  assert.ok(dataActions.every((action) => action.permissionPolicies.length > 0));
  assert.ok(dataActions.every((action) => !action.permissionPolicies.includes('public-or-unverified')));
  assert.equal(actionMap.summary.actionableUnresolved, 0);
  assert.ok(actionMap.summary.delegatedBindings >= 100);
});

test('object assignment in Realm error tracing is not classified as navigation', () => {
  const saveProfile = actionMap.actions.find(
    (action) => action.source === 'components/realm/RealmOffice.jsx' && action.handler === 'saveProfile',
  );
  assert.equal(saveProfile?.actionType, 'data-action');
  assert.ok(saveProfile?.apiCalls.includes('POST /api/realm-demo/operations'));
  assert.ok(!saveProfile?.routeTargets.includes('responseError'));
});

test('action map artifacts are deterministic', () => {
  const first = renderActionMapArtifacts(actionMap);
  const second = renderActionMapArtifacts(buildUiActionMap(root));
  assert.deepEqual(second, first);
});
