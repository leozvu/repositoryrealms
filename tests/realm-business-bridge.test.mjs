import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ERP_NAV_ITEMS } from '../lib/erp-navigation.js';
import {
  REALM_CORE_PORTALS,
  REALM_ERP_BRIDGE_CATALOG,
  buildRealmQuestLinks,
  createRealmErpBridge,
  realmRecordHref,
  unresolvedRealmBridgeMappings,
} from '../lib/realm-business-bridge.js';
import { buildRealmErpBridgeAudit, renderRealmErpBridgeArtifacts } from '../scripts/lib/realm-erp-bridge-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('mọi primary ERP route có medieval mapping nhưng giữ nguyên route và RBAC', () => {
  assert.equal(REALM_ERP_BRIDGE_CATALOG.length, ERP_NAV_ITEMS.length);
  assert.equal(unresolvedRealmBridgeMappings().length, 0);
  for (const mapping of REALM_ERP_BRIDGE_CATALOG) {
    const nav = ERP_NAV_ITEMS.find((item) => item.key === mapping.key);
    assert.ok(nav);
    assert.equal(mapping.href, `/${nav.key}`);
    assert.deepEqual(mapping.roles, nav.roles);
    assert.equal(mapping.module, nav.mod || null);
  }
});

test('record links chỉ sinh internal deep-link từ ID an toàn', () => {
  assert.equal(realmRecordHref('task', 'task-1'), '/tasks?focus=task-1&from=realm');
  assert.equal(realmRecordHref('lead', 'lead_1'), '/leads?focus=lead_1&from=realm');
  assert.equal(realmRecordHref('project', 'project:1'), '/projects/project%3A1');
  assert.equal(realmRecordHref('staff', '../admin'), '/staff');
  assert.equal(realmRecordHref('unknown', 'task-1'), '/dashboard');
});

test('Quest snapshot mang link tới Task, Project và hồ sơ assignee gốc', () => {
  assert.deepEqual(buildRealmQuestLinks({ id: 't-1', project: { id: 'p-1' }, assignee: { id: 'u-1' } }), {
    task: '/tasks?focus=t-1&from=realm',
    project: '/projects/p-1',
    owner: '/staff/u-1',
  });
  const bridge = createRealmErpBridge({ user: { id: 'u-1' }, tasks: [
    { id: 't-1', status: 'todo', project: { id: 'p-1' } },
    { id: 't-2', status: 'done', project: { id: 'p-1' } },
  ] });
  assert.equal(bridge.profileHref, '/staff/u-1');
  assert.deepEqual(bridge.counters, { quests: 2, openQuests: 1, campaigns: 1 });
  assert.deepEqual(bridge.portals, REALM_CORE_PORTALS);
});

test('Phase 4 audit xác minh toàn bộ route, flow và link contract', () => {
  const result = buildRealmErpBridgeAudit(root);
  assert.equal(result.summary.verifiedNavigationRoutes, result.summary.erpNavigationRoutes);
  assert.equal(result.summary.verifiedRecordFlows, result.summary.recordFlows);
  assert.equal(result.summary.verifiedLinkContracts, result.summary.linkContracts);
  assert.equal(result.summary.unresolvedMappings, 0);
  assert.equal(result.summary.catalogDrift, 0);
});

test('Phase 4 artifacts deterministic', () => {
  const first = renderRealmErpBridgeArtifacts(buildRealmErpBridgeAudit(root));
  const second = renderRealmErpBridgeArtifacts(buildRealmErpBridgeAudit(root));
  assert.deepEqual(second, first);
});
