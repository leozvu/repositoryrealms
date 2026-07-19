import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  REALM_SURFACE_POLICIES,
  createRealmAccessManifest,
  parseRealmCompanyModules,
  realmAccessForPanel,
  realmSurfaceDecision,
} from '../lib/realm-access.js';
import { createRealmErpBridge } from '../lib/realm-business-bridge.js';
import { buildRealmAccessAudit, renderRealmAccessArtifacts } from '../scripts/lib/realm-access-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const user = (role, extra = {}) => ({ id: `${role.toLowerCase()}-1`, name: role, role, roles: [role], userType: 'employee', ...extra });

test('manifest áp đúng policy cho từng vai trò ERP', () => {
  const staff = createRealmAccessManifest({ user: user('STAFF'), modules: null });
  assert.equal(staff.surfaces.personal.allowed, true);
  assert.equal(staff.surfaces.quests.allowed, true);
  assert.equal(staff.surfaces.rewards.allowed, false);
  assert.equal(staff.surfaces.economy.allowed, false);
  assert.equal(staff.surfaces.embassy.allowed, false);

  const am = createRealmAccessManifest({ user: user('AM'), modules: null });
  assert.equal(am.surfaces.embassy.allowed, true);
  assert.equal(am.surfaces.rewards.allowed, false);

  const pm = createRealmAccessManifest({ user: user('PM'), modules: null });
  assert.equal(pm.surfaces.rewards.allowed, true);
  assert.equal(pm.surfaces.economy.allowed, true);
  assert.equal(pm.surfaces.embassy.allowed, false);

  const director = createRealmAccessManifest({ user: user('DIRECTOR'), modules: null });
  assert.ok(Object.values(director.surfaces).every((surface) => surface.allowed));
});

test('module, team scope và freelancer khóa surface trước khi UI gọi API', () => {
  const noModules = createRealmAccessManifest({ user: user('STAFF'), modules: [] });
  assert.deepEqual(Object.entries(noModules.surfaces).filter(([, access]) => access.allowed).map(([key]) => key), ['personal', 'treasury']);
  assert.equal(noModules.surfaces.quests.code, 'module_disabled');

  const leadWithoutTeam = realmSurfaceDecision(user('LEAD'), 'economy', ['tasks']);
  assert.equal(leadWithoutTeam.allowed, false);
  assert.equal(leadWithoutTeam.code, 'team_scope_missing');
  assert.equal(realmSurfaceDecision(user('LEAD', { teamId: 'team-1' }), 'economy', ['tasks']).allowed, true);

  const freelancer = createRealmAccessManifest({ user: user('FREELANCER', { userType: 'freelancer' }), modules: null });
  assert.ok(Object.values(freelancer.surfaces).every((surface) => !surface.allowed));
  assert.equal(freelancer.surfaces.personal.code, 'freelancer_forbidden');
});

test('bridge lọc portal theo cùng role/module và giữ lý do cho portal bị khóa', () => {
  const bridge = createRealmErpBridge({ user: user('STAFF'), modules: ['tasks'], tasks: [] });
  assert.equal(bridge.version, 2);
  assert.equal(bridge.access.source, 'erp-session');
  assert.equal(bridge.portals.some((portal) => portal.key === 'tasks'), true);
  assert.equal(bridge.portals.some((portal) => portal.key === 'projects'), false);
  assert.equal(bridge.unavailablePortals.find((portal) => portal.key === 'projects')?.access.code, 'module_disabled');
  assert.equal(realmAccessForPanel(bridge.access, 'campaigns').allowed, false);
});

test('parser module tương thích setting cũ và payload lỗi', () => {
  assert.deepEqual(parseRealmCompanyModules('{"modules":["tasks","sales"]}'), ['tasks', 'sales']);
  assert.equal(parseRealmCompanyModules('{}'), null);
  assert.equal(parseRealmCompanyModules('{broken'), null);
  assert.equal(REALM_SURFACE_POLICIES.length, 8);
});

test('Phase 5 audit xác minh role/module scenarios và server/UI enforcement', () => {
  const result = buildRealmAccessAudit(root);
  assert.equal(result.summary.verifiedRoleScenarios, result.summary.roleScenarios);
  assert.equal(result.summary.verifiedModuleScenarios, result.summary.moduleScenarios);
  assert.equal(result.summary.verifiedEnforcementContracts, result.summary.enforcementContracts);
  assert.equal(result.summary.failedPolicies, 0);
});

test('Phase 5 artifacts deterministic', () => {
  const first = renderRealmAccessArtifacts(buildRealmAccessAudit(root));
  const second = renderRealmAccessArtifacts(buildRealmAccessAudit(root));
  assert.deepEqual(second, first);
});
