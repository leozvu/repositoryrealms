import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REALM_PILOT_CONFIG,
  loadRealmPilotDirectory,
  loadRealmPilotMetrics,
  normalizeRealmPilotConfig,
  normalizeRealmWorkspacePreference,
  parseRealmPilotConfig,
  publicRealmPilotConfig,
  realmPilotDecision,
  saveRealmPilotConfig,
  saveRealmWorkspacePreference,
  realmPilotFeatureEnabled,
} from '../lib/realm-pilot.js';

const DIRECTOR = { id: 'director-1', name: 'Director', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee' };
const STAFF = { id: 'staff-1', name: 'Staff', role: 'STAFF', roles: '["STAFF"]', status: 'active', userType: 'employee' };

function preferenceDb({ mode = 'open', preference = 'auto' } = {}) {
  const calls = { updates: [], audits: [] };
  const setting = { json: JSON.stringify({ company: 'Realm QA', realmPilot: { mode, defaultSurface: 'erp', roles: ['STAFF'] } }) };
  const profile = { ...STAFF, workspacePreference: preference };
  const db = {
    setting: { findUnique: async () => setting },
    user: { findUnique: async () => profile },
    $transaction: async (operation) => operation({
      user: { update: async (value) => { calls.updates.push(value); return value; } },
      auditLog: { create: async (value) => { calls.audits.push(value); return value; } },
    }),
  };
  return { db, calls };
}

test('pilot config and workspace preferences normalize untrusted values safely', () => {
  assert.equal(normalizeRealmWorkspacePreference(' REALM '), 'realm');
  assert.equal(normalizeRealmWorkspacePreference('unknown'), 'auto');
  assert.deepEqual(normalizeRealmPilotConfig({ mode: 'pilot', defaultSurface: 'realm', roles: ['STAFF', 'STAFF', 'INVALID'] }), {
    mode: 'pilot', defaultSurface: 'realm', cohortStrategy: 'roles', roles: ['STAFF'], memberIds: [],
    features: { office: true, tavern: true, feedback: true }, onboardingVersion: 1, version: 0,
  });
  const flags = normalizeRealmPilotConfig({ features: { office: false, tavern: false }, onboardingVersion: 120, version: 4 });
  assert.deepEqual(flags.features, { office: false, tavern: false, feedback: true });
  assert.equal(flags.onboardingVersion, 99);
  assert.equal(flags.version, 4);
  assert.equal(realmPilotFeatureEnabled(flags, 'tavern'), false);
  assert.equal(realmPilotFeatureEnabled(flags, 'unknown'), false);
  assert.deepEqual(normalizeRealmPilotConfig({ mode: 'invalid', defaultSurface: 'invalid' }), DEFAULT_REALM_PILOT_CONFIG);
  assert.deepEqual(parseRealmPilotConfig('{broken'), DEFAULT_REALM_PILOT_CONFIG);
  assert.deepEqual(parseRealmPilotConfig(JSON.stringify({ realmPilot: { mode: 'off', roles: [] } })), {
    mode: 'off', defaultSurface: 'erp', cohortStrategy: 'roles', roles: [], memberIds: [],
    features: { office: true, tavern: true, feedback: true }, onboardingVersion: 1, version: 0,
  });
});

test('pilot decision keeps ERP as fallback and enforces internal cohorts', () => {
  assert.equal(realmPilotDecision(null, null).code, 'unauthorized');
  const freelancer = realmPilotDecision({ ...STAFF, userType: 'freelancer' }, { mode: 'open' });
  assert.equal(freelancer.code, 'freelancer_forbidden');
  assert.equal(freelancer.resolvedSurface, 'erp');

  const disabled = realmPilotDecision(STAFF, { mode: 'off', defaultSurface: 'realm' }, 'realm');
  assert.equal(disabled.code, 'realm_pilot_disabled');
  assert.equal(disabled.resolvedSurface, 'erp');

  const officeDisabled = realmPilotDecision(STAFF, { mode: 'pilot', roles: ['STAFF'], features: { office: false } }, 'realm');
  assert.equal(officeDisabled.code, 'realm_office_disabled');
  assert.equal(officeDisabled.resolvedSurface, 'erp');

  const denied = realmPilotDecision(STAFF, { mode: 'pilot', defaultSurface: 'realm', roles: ['PM'] }, 'realm');
  assert.equal(denied.code, 'realm_pilot_cohort_required');
  assert.equal(denied.allowed, false);

  const granted = realmPilotDecision(STAFF, { mode: 'pilot', defaultSurface: 'realm', roles: ['STAFF'] }, 'auto');
  assert.equal(granted.allowed, true);
  assert.equal(granted.resolvedSurface, 'realm');
  const namedGranted = realmPilotDecision(STAFF, { mode: 'pilot', cohortStrategy: 'members', memberIds: ['staff-1'] }, 'realm');
  assert.equal(namedGranted.allowed, true);
  const namedDenied = realmPilotDecision(STAFF, { mode: 'pilot', cohortStrategy: 'members', memberIds: ['director-1'], roles: ['STAFF'] }, 'realm');
  assert.equal(namedDenied.code, 'realm_pilot_cohort_required');
  assert.equal(realmPilotDecision(STAFF, { mode: 'open', defaultSurface: 'realm' }, 'erp').resolvedSurface, 'erp');
});

test('named cohort normalization is bounded and public policy never exposes member ids', () => {
  const ids = Array.from({ length: 54 }, (_, index) => `member-${index}`);
  const policy = normalizeRealmPilotConfig({ cohortStrategy: 'members', memberIds: ['staff-1', 'staff-1', ...ids] });
  assert.equal(policy.memberIds.length, 50);
  assert.equal(policy.memberIds[0], 'staff-1');
  const publicPolicy = publicRealmPilotConfig(policy);
  assert.equal('memberIds' in publicPolicy, false);
  assert.equal(publicPolicy.memberCount, 50);
  assert.equal(publicPolicy.cohortStrategy, 'members');
});

test('adoption metrics deduplicate tabs and expose aggregate privacy-safe counts', async () => {
  const now = new Date('2026-07-19T12:00:00.000Z');
  const db = {
    user: { findMany: async () => [
      { ...DIRECTOR, workspacePreference: 'auto' },
      { ...STAFF, workspacePreference: 'realm' },
      { id: 'pm-1', role: 'PM', roles: '["PM"]', userType: 'employee', workspacePreference: 'erp' },
    ] },
    collaborationPresenceSession: { findMany: async (query) => {
      assert.equal(query.where.lastSeen.gte.toISOString(), '2026-07-19T11:58:30.000Z');
      return [
        { userId: 'staff-1', surface: 'realm' },
        { userId: 'staff-1', surface: 'realm' },
        { userId: 'director-1', surface: 'erp' },
        { userId: 'pm-1', surface: 'erp' },
        { userId: 'staff-1', surface: 'invalid' },
      ];
    } },
  };
  const metrics = await loadRealmPilotMetrics(db, { mode: 'pilot', roles: ['DIRECTOR', 'STAFF'] }, now);
  assert.equal(metrics.eligibleUsers, 2);
  assert.deepEqual(metrics.preferences, { auto: 1, erp: 0, realm: 1 });
  assert.deepEqual(metrics.online, { total: 2, erp: 1, realm: 1 });
  assert.deepEqual(metrics.cohort, { strategy: 'roles', selected: 2, available: 3 });
  assert.deepEqual(metrics.privacy, {
    aggregateOnly: true,
    performanceTracking: false,
    durationTracking: false,
    source: 'workspace-preference-and-expiring-presence',
  });
});

test('workspace preference writes an audit record and never bypasses pilot policy', async () => {
  const allowed = preferenceDb();
  const saved = await saveRealmWorkspacePreference(allowed.db, STAFF, 'realm');
  assert.equal(saved.preference, 'realm');
  assert.equal(saved.resolvedSurface, 'realm');
  assert.equal(allowed.calls.updates[0].data.workspacePreference, 'realm');
  assert.equal(allowed.calls.audits[0].data.entity, 'realm_workspace_preference');

  await assert.rejects(() => saveRealmWorkspacePreference(allowed.db, STAFF, 'castle'), (error) => error.code === 'realm_preference_invalid');
  const disabled = preferenceDb({ mode: 'off' });
  await assert.rejects(() => saveRealmWorkspacePreference(disabled.db, STAFF, 'realm'), (error) => error.code === 'realm_pilot_disabled');
  const erp = await saveRealmWorkspacePreference(disabled.db, STAFF, 'erp');
  assert.equal(erp.resolvedSurface, 'erp');
});

test('only directors can save a valid pilot policy while preserving company settings', async () => {
  const calls = { upserts: [], audits: [], transactionOptions: null };
  const tx = {
    setting: {
      findUnique: async () => ({ json: JSON.stringify({ company: 'Keep me', smtpHost: 'mail.example' }) }),
      upsert: async (value) => { calls.upserts.push(value); return value; },
    },
    user: { findMany: async ({ where }) => where.id.in.map((id) => ({ id })) },
    auditLog: { create: async (value) => { calls.audits.push(value); return value; } },
  };
  const db = { $transaction: async (operation, options) => { calls.transactionOptions = options; return operation(tx); } };

  await assert.rejects(() => saveRealmPilotConfig(db, STAFF, { mode: 'open' }), (error) => error.code === 'realm_pilot_admin_forbidden');
  await assert.rejects(() => saveRealmPilotConfig(db, DIRECTOR, { mode: 'pilot', roles: [] }), (error) => error.code === 'realm_pilot_roles_required');
  const saved = await saveRealmPilotConfig(db, DIRECTOR, { mode: 'pilot', defaultSurface: 'realm', roles: ['STAFF', 'INVALID'] });
  assert.deepEqual(saved, {
    mode: 'pilot', defaultSurface: 'realm', cohortStrategy: 'roles', roles: ['STAFF'], memberIds: [],
    features: { office: true, tavern: true, feedback: true }, onboardingVersion: 1, version: 1,
  });
  const merged = JSON.parse(calls.upserts[0].update.json);
  assert.equal(merged.company, 'Keep me');
  assert.equal(merged.smtpHost, 'mail.example');
  assert.deepEqual(merged.realmPilot, saved);
  assert.equal(calls.audits[0].data.entity, 'realm_pilot');
  assert.deepEqual(calls.transactionOptions, { isolationLevel: 'Serializable' });

  tx.setting.findUnique = async () => ({ json: JSON.stringify({ realmPilot: { ...saved, version: 3 } }) });
  await assert.rejects(
    () => saveRealmPilotConfig(db, DIRECTOR, { ...saved, version: 2 }),
    (error) => error.code === 'realm_pilot_version_conflict',
  );
});

test('director can save only active internal named cohort members', async () => {
  const calls = { audit: null, saved: null, members: ['staff-1'] };
  const tx = {
    setting: {
      findUnique: async () => ({ json: '{}' }),
      upsert: async (value) => { calls.saved = JSON.parse(value.update.json).realmPilot; },
    },
    user: { findMany: async () => calls.members.map((id) => ({ id })) },
    auditLog: { create: async (value) => { calls.audit = value.data; } },
  };
  const db = { $transaction: async (operation) => operation(tx) };
  const saved = await saveRealmPilotConfig(db, DIRECTOR, {
    mode: 'pilot', defaultSurface: 'erp', cohortStrategy: 'members', memberIds: ['staff-1'], version: 0,
  });
  assert.equal(saved.cohortStrategy, 'members');
  assert.deepEqual(saved.memberIds, ['staff-1']);
  assert.match(calls.audit.detail, /cohort members; members 1/);

  calls.members = [];
  await assert.rejects(
    () => saveRealmPilotConfig(db, DIRECTOR, { ...saved, version: 0 }),
    (error) => error.code === 'realm_pilot_members_stale',
  );
  await assert.rejects(
    () => saveRealmPilotConfig(db, DIRECTOR, { mode: 'pilot', cohortStrategy: 'members', memberIds: [] }),
    (error) => error.code === 'realm_pilot_members_required',
  );

  const disabled = await saveRealmPilotConfig(db, DIRECTOR, {
    mode: 'off', defaultSurface: 'erp', cohortStrategy: 'members', memberIds: ['inactive-user'], version: 0,
  });
  assert.equal(disabled.mode, 'off');
  assert.deepEqual(disabled.memberIds, ['inactive-user']);
});

test('pilot directory exposes identity needed for access control without preference or performance data', async () => {
  const db = {
    user: {
      findMany: async (query) => {
        assert.deepEqual(query.where, { status: 'active', userType: 'employee' });
        assert.equal(query.take, 500);
        return [{ id: 'staff-1', name: 'Staff', title: 'Designer', role: 'STAFF', roles: '["STAFF"]', workspacePreference: 'realm', salary: 99 }];
      },
    },
  };
  const directory = await loadRealmPilotDirectory(db);
  assert.deepEqual(directory, [{ id: 'staff-1', name: 'Staff', title: 'Designer', roles: ['STAFF'] }]);
  assert.equal(JSON.stringify(directory).includes('workspacePreference'), false);
  assert.equal(JSON.stringify(directory).includes('salary'), false);
});
