import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRealmPilotGoNoGoReport,
  buildRealmPilotOperationAlerts,
  createRealmPilotWave,
  normalizeRealmPilotOperations,
  parseRealmPilotOperations,
  transitionRealmPilotWave,
} from '../lib/realm-pilot-operations.js';
import { normalizeRealmPilotConfig } from '../lib/realm-pilot.js';

const NOW = new Date('2026-07-19T16:00:00.000Z');
const MAKER = { id: 'director-maker', name: 'Maker', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee', workspacePreference: 'erp' };
const CHECKER = { id: 'director-checker', name: 'Checker', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee', workspacePreference: 'erp' };
const STAFF = { id: 'staff-private-id', name: 'Staff', role: 'STAFF', roles: '["STAFF"]', status: 'active', userType: 'employee', workspacePreference: 'auto' };

function database() {
  let setting = {
    company: 'Keep ERP',
    realmPilot: normalizeRealmPilotConfig({
      mode: 'pilot',
      defaultSurface: 'erp',
      cohortStrategy: 'members',
      memberIds: [STAFF.id],
      roles: [],
      version: 4,
    }),
  };
  let rawCall = 0;
  const audits = [];
  const notifications = [];
  const tx = {
    setting: {
      findUnique: async () => ({ json: JSON.stringify(setting) }),
      upsert: async ({ update }) => { setting = JSON.parse(update.json); },
    },
    user: { findMany: async () => [MAKER, CHECKER, STAFF] },
    collaborationPresenceSession: { findMany: async () => [] },
    ticket: { count: async () => 0 },
    approval: { count: async () => 0 },
    notification: { createMany: async ({ data }) => { notifications.push(...data); return { count: data.length }; } },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    $queryRaw: async () => {
      rawCall += 1;
      return rawCall % 2 === 1
        ? [{ userTable: true, collaborationTable: true, changeFeedTable: true, actionReceiptTable: true, pilotPreferenceColumn: true, pilotFeedbackColumns: true, migrationTable: true }]
        : [{ applied: true }];
    },
  };
  return {
    db: { ...tx, $transaction: async (operation) => operation(tx) },
    audits,
    notifications,
    setting: () => setting,
  };
}

test('Phase 16 normalizes bounded aggregate-only wave state safely', () => {
  const operations = normalizeRealmPilotOperations({
    version: -2,
    waves: [{ id: 'wave-1', name: '  First   wave ', status: 'active', durationDays: 99, eligibleUsers: -4, fallbackUsers: 2 }],
  });
  assert.equal(operations.version, 0);
  assert.equal(operations.waves[0].name, 'First wave');
  assert.equal(operations.waves[0].durationDays, 14);
  assert.equal(operations.waves[0].eligibleUsers, 0);
  assert.deepEqual(parseRealmPilotOperations('{broken'), { version: 0, waves: [] });
});

test('Phase 16 creates a draft in existing Setting without replacing ERP configuration', async () => {
  const fixture = database();
  const result = await createRealmPilotWave(fixture.db, MAKER, {
    action: 'create',
    expectedVersion: 0,
    name: 'Guild Alpha',
    durationDays: 10,
  }, { now: NOW, idFactory: () => 'wave-1' });
  assert.equal(result.wave.id, 'rpw_wave-1');
  assert.equal(result.wave.status, 'draft');
  assert.equal(result.wave.eligibleUsers, 1);
  assert.equal(result.wave.fallbackUsers, 2);
  assert.equal(result.operations.version, 1);
  assert.equal(fixture.setting().company, 'Keep ERP');
  assert.equal(fixture.setting().realmPilot.version, 4);
  assert.equal(fixture.setting().realmPilotOperations.waves.length, 1);
  assert.match(fixture.audits[0].detail, /no roster/);
  assert.equal(JSON.stringify(result.wave).includes(STAFF.id), false);
});

test('Phase 16 requires a different Director and revalidates readiness before activation', async () => {
  const fixture = database();
  await createRealmPilotWave(fixture.db, MAKER, {
    expectedVersion: 0,
    name: 'Guild Alpha',
    durationDays: 7,
  }, { now: NOW, idFactory: () => 'wave-1' });
  const submitted = await transitionRealmPilotWave(fixture.db, MAKER, {
    action: 'submit', waveId: 'rpw_wave-1', expectedVersion: 1,
  }, { now: new Date(NOW.getTime() + 60_000) });
  assert.equal(submitted.wave.status, 'awaiting_approval');
  assert.equal(submitted.notificationCount, 1);
  assert.equal(fixture.notifications[0].userId, CHECKER.id);

  await assert.rejects(
    () => transitionRealmPilotWave(fixture.db, MAKER, {
      action: 'approve', waveId: 'rpw_wave-1', expectedVersion: 2,
    }, { now: new Date(NOW.getTime() + 120_000) }),
    (error) => error.code === 'self_approval_forbidden',
  );
  assert.equal(fixture.setting().realmPilotOperations.waves[0].status, 'awaiting_approval');

  const approved = await transitionRealmPilotWave(fixture.db, CHECKER, {
    action: 'approve', waveId: 'rpw_wave-1', expectedVersion: 2,
  }, { now: new Date(NOW.getTime() + 180_000) });
  assert.equal(approved.wave.status, 'active');
  assert.equal(approved.notificationCount, 1);
  assert.equal(fixture.notifications.at(-1).userId, STAFF.id);
  assert.equal(fixture.notifications.at(-1).route, '/realm');
  assert.equal(approved.operations.version, 3);
});

test('Phase 16 pause atomically activates the existing kill switch and preserves wave evidence', async () => {
  const fixture = database();
  await createRealmPilotWave(fixture.db, MAKER, { expectedVersion: 0, name: 'Guild Alpha', durationDays: 7 }, { now: NOW, idFactory: () => 'wave-1' });
  await transitionRealmPilotWave(fixture.db, MAKER, { action: 'submit', waveId: 'rpw_wave-1', expectedVersion: 1 }, { now: new Date(NOW.getTime() + 60_000) });
  await transitionRealmPilotWave(fixture.db, CHECKER, { action: 'approve', waveId: 'rpw_wave-1', expectedVersion: 2 }, { now: new Date(NOW.getTime() + 120_000) });
  const paused = await transitionRealmPilotWave(fixture.db, MAKER, {
    action: 'pause', waveId: 'rpw_wave-1', expectedVersion: 3, note: 'SEV-2 rehearsal',
  }, { now: new Date(NOW.getTime() + 180_000) });
  assert.equal(paused.wave.status, 'paused');
  assert.equal(paused.policy.mode, 'off');
  assert.equal(fixture.setting().realmPilot.mode, 'off');
  assert.equal(fixture.setting().realmPilotOperations.waves[0].status, 'paused');
  assert.equal(fixture.setting().company, 'Keep ERP');
  assert.equal(fixture.audits.some((row) => row.entity === 'realm_pilot'), true);
  assert.equal(fixture.audits.at(-1).entity, 'realm_pilot_operations');
  assert.equal(fixture.notifications.at(-1).route, '/dashboard');
});

test('Phase 16 Go/No-go report respects the 7–14 day window and never scores people', () => {
  const wave = { id: 'wave-1', status: 'active', activatedAt: NOW.toISOString() };
  const readiness = {
    ready: true,
    summary: { blockers: 0, blockedFeedback: 0 },
    gates: [{ id: 'erp-fallback', passed: true }],
  };
  const early = buildRealmPilotGoNoGoReport({ wave, readiness, now: new Date(NOW.getTime() + 6 * 86_400_000) });
  assert.equal(early.recommendation, 'hold');
  assert.equal(early.available, false);
  const ready = buildRealmPilotGoNoGoReport({ wave, readiness, now: new Date(NOW.getTime() + 8 * 86_400_000) });
  assert.equal(ready.recommendation, 'go');
  assert.equal(ready.available, true);
  const blocked = buildRealmPilotGoNoGoReport({ wave, readiness: { ...readiness, ready: false, summary: { blockers: 1, blockedFeedback: 1 } }, now: NOW });
  assert.equal(blocked.recommendation, 'no_go');
  assert.equal(JSON.stringify(ready).includes('userId'), false);
  assert.equal(ready.privacy.performanceTracking, false);
  assert.equal(ready.privacy.durationTracking, false);
});

test('Phase 16 alerts surface readiness, policy drift and kill-switch state without a roster', () => {
  const alerts = buildRealmPilotOperationAlerts({
    policy: { mode: 'off', version: 6 },
    operations: { version: 2, waves: [{ id: 'wave-1', status: 'paused', policyVersion: 4 }] },
    readiness: { ready: false, summary: { blockers: 2, blockedFeedback: 1 } },
    now: NOW,
  });
  assert.deepEqual(alerts.map((row) => row.id), ['readiness-blocked', 'blocked-feedback', 'policy-drift', 'kill-switch-active']);
  assert.equal(JSON.stringify(alerts).includes(STAFF.id), false);
});
