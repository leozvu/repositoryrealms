import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REALM_REHEARSAL_SCENARIOS,
  buildRealmPilotRehearsalGate,
  buildRealmRehearsalRemediation,
  createRealmPilotRehearsal,
  loadRealmPilotRehearsalDashboard,
  normalizeRealmPilotRehearsals,
  parseRealmPilotRehearsals,
  requireValidRealmPilotRehearsal,
  transitionRealmPilotRehearsal,
} from '../lib/realm-pilot-rehearsal.js';
import { normalizeRealmPilotConfig } from '../lib/realm-pilot.js';

const NOW = new Date('2026-07-19T18:00:00.000Z');
const MAKER = { id: 'director-maker', name: 'Maker', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee' };
const CHECKER = { id: 'director-checker', name: 'Checker', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee' };
const STAFF = { id: 'staff-private-id', name: 'Staff', role: 'STAFF', roles: '["STAFF"]', status: 'active', userType: 'employee', workspacePreference: 'erp' };

function database({ mode = 'pilot', blockedFeedback = 0, directors = [MAKER, CHECKER] } = {}) {
  let setting = {
    company: 'Keep ERP',
    realmPilot: normalizeRealmPilotConfig({
      mode,
      defaultSurface: 'erp',
      cohortStrategy: 'members',
      memberIds: [STAFF.id],
      roles: [],
      features: { office: true, tavern: true, feedback: true },
      version: 7,
    }),
  };
  let rawCall = 0;
  const audits = [];
  const notifications = [];
  const tx = {
    setting: {
      findUnique: async () => ({ json: JSON.stringify(setting) }),
      upsert: async ({ update, create }) => { setting = JSON.parse((update || create).json); },
    },
    user: { findMany: async () => [...directors, STAFF] },
    collaborationPresenceSession: { findMany: async () => [] },
    ticket: { count: async ({ where } = {}) => where?.feedbackContext ? blockedFeedback : blockedFeedback },
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

async function createAndAttestAll(fixture) {
  const created = await createRealmPilotRehearsal(fixture.db, MAKER, {
    expectedVersion: 0,
    name: 'Wave Alpha rehearsal',
  }, { now: NOW, idFactory: () => 'rehearsal-1' });
  let version = created.rehearsals.version;
  for (const scenario of REALM_REHEARSAL_SCENARIOS) {
    const result = await transitionRealmPilotRehearsal(fixture.db, MAKER, {
      action: 'attest',
      runId: created.run.id,
      expectedVersion: version,
      scenarioId: scenario.id,
      result: 'passed',
      evidence: `Operational verification for ${scenario.id}`,
    }, { now: new Date(NOW.getTime() + version * 1_000) });
    version = result.rehearsals.version;
  }
  return { runId: created.run.id, version };
}

test('Phase 17 normalizes bounded rehearsal evidence and drops unknown scenarios', () => {
  const rehearsals = normalizeRealmPilotRehearsals({
    version: -3,
    runs: [{ id: 'run-1', name: '  Launch   check ', status: 'broken', checks: [{ id: 'unknown', result: 'passed', evidence: 'secret' }, { id: REALM_REHEARSAL_SCENARIOS[0].id, result: 'failed', evidence: '  Network   failed ' }] }],
  });
  assert.equal(rehearsals.version, 0);
  assert.equal(rehearsals.runs[0].status, 'draft');
  assert.equal(rehearsals.runs[0].name, 'Launch check');
  assert.equal(rehearsals.runs[0].checks.length, REALM_REHEARSAL_SCENARIOS.length);
  assert.equal(rehearsals.runs[0].checks[0].evidence, 'Network failed');
  assert.equal(JSON.stringify(rehearsals).includes('unknown'), false);
  assert.deepEqual(parseRealmPilotRehearsals('{broken'), { version: 0, runs: [] });
});

test('Phase 17 sealed gate is policy-bound, expires after 24 hours and exposes no roster', () => {
  const policy = normalizeRealmPilotConfig({ mode: 'pilot', defaultSurface: 'erp', version: 7 });
  const setting = {
    realmPilot: policy,
    realmPilotRehearsal: {
      version: 1,
      runs: [{
        id: 'sealed-1', status: 'sealed', policyVersion: 7,
        checks: REALM_REHEARSAL_SCENARIOS.map((scenario) => ({ id: scenario.id, result: 'passed', evidence: 'Verified operationally' })),
        sealedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
      }],
    },
  };
  const valid = buildRealmPilotRehearsalGate(setting, policy, NOW);
  assert.equal(valid.readyForWave, true);
  assert.equal(valid.rehearsalId, 'sealed-1');
  assert.equal(JSON.stringify(valid).includes(STAFF.id), false);
  assert.equal(buildRealmPilotRehearsalGate(setting, { ...policy, version: 8 }, NOW).readyForWave, false);
  assert.equal(buildRealmPilotRehearsalGate(setting, policy, new Date(NOW.getTime() + 25 * 3_600_000)).readyForWave, false);
  assert.throws(() => requireValidRealmPilotRehearsal(setting, policy, NOW, 'different'), (error) => error.code === 'realm_rehearsal_stale');
});

test('Phase 17 creates a rehearsal in Setting without replacing ERP configuration', async () => {
  const fixture = database();
  const result = await createRealmPilotRehearsal(fixture.db, MAKER, { expectedVersion: 0, name: 'Guild rehearsal' }, { now: NOW, idFactory: () => 'run-1' });
  assert.equal(result.run.id, 'rpr_run-1');
  assert.equal(result.run.status, 'draft');
  assert.equal(result.run.policyVersion, 7);
  assert.equal(result.run.checks.length, REALM_REHEARSAL_SCENARIOS.length);
  assert.equal(fixture.setting().company, 'Keep ERP');
  assert.equal(fixture.setting().realmPilot.version, 7);
  assert.equal(fixture.audits[0].entity, 'realm_pilot_rehearsal');
  assert.match(fixture.audits[0].detail, /no roster; no record content/);
});

test('Phase 17 requires operational evidence, live readiness and a different Director to seal', async () => {
  const fixture = database();
  const { runId, version } = await createAndAttestAll(fixture);
  const submitted = await transitionRealmPilotRehearsal(fixture.db, MAKER, {
    action: 'submit', runId, expectedVersion: version,
  }, { now: new Date(NOW.getTime() + 30_000) });
  assert.equal(submitted.run.status, 'awaiting_approval');
  assert.equal(submitted.notificationCount, 1);
  assert.equal(fixture.notifications.at(-1).userId, CHECKER.id);

  await assert.rejects(
    () => transitionRealmPilotRehearsal(fixture.db, MAKER, { action: 'approve', runId, expectedVersion: submitted.rehearsals.version }, { now: new Date(NOW.getTime() + 31_000) }),
    (error) => error.code === 'self_approval_forbidden',
  );

  const sealed = await transitionRealmPilotRehearsal(fixture.db, CHECKER, {
    action: 'approve', runId, expectedVersion: submitted.rehearsals.version, note: 'All controls reviewed',
  }, { now: new Date(NOW.getTime() + 32_000) });
  assert.equal(sealed.run.status, 'sealed');
  assert.equal(sealed.run.sealedByName, CHECKER.name);
  assert.equal(new Date(sealed.run.expiresAt).getTime() - new Date(sealed.run.sealedAt).getTime(), 24 * 3_600_000);
  assert.equal(buildRealmPilotRehearsalGate(fixture.setting(), fixture.setting().realmPilot, new Date(NOW.getTime() + 33_000)).readyForWave, true);
  assert.equal(fixture.audits.some((audit) => audit.detail.includes('Operational verification')), false);
});

test('Phase 17 blocks submit when evidence or independent checker is missing', async () => {
  const missingEvidence = database();
  const created = await createRealmPilotRehearsal(missingEvidence.db, MAKER, { expectedVersion: 0, name: 'Incomplete rehearsal' }, { now: NOW, idFactory: () => 'run-2' });
  await assert.rejects(
    () => transitionRealmPilotRehearsal(missingEvidence.db, MAKER, { action: 'submit', runId: created.run.id, expectedVersion: 1 }, { now: NOW }),
    (error) => error.code === 'realm_rehearsal_checks_incomplete',
  );
  await assert.rejects(
    () => transitionRealmPilotRehearsal(missingEvidence.db, MAKER, { action: 'attest', runId: created.run.id, expectedVersion: 1, scenarioId: REALM_REHEARSAL_SCENARIOS[0].id, result: 'passed', evidence: 'short' }, { now: NOW }),
    (error) => error.code === 'realm_rehearsal_evidence_required',
  );

  const noChecker = database({ directors: [MAKER] });
  const ready = await createAndAttestAll(noChecker);
  await assert.rejects(
    () => transitionRealmPilotRehearsal(noChecker.db, MAKER, { action: 'submit', runId: ready.runId, expectedVersion: ready.version }, { now: NOW }),
    (error) => error.code === 'realm_rehearsal_checker_missing',
  );
});

test('Phase 17 dashboard turns failed readiness gates into actionable remediation without a roster', async () => {
  const fixture = database({ mode: 'internal' });
  const dashboard = await loadRealmPilotRehearsalDashboard(fixture.db, MAKER, { now: NOW });
  assert.equal(dashboard.canCreate, false);
  assert.equal(dashboard.readyToSubmit, false);
  assert.equal(dashboard.remediation.some((item) => item.id === 'controlled-cohort' && !item.passed && item.target === '/settings#realm-pilot-title'), true);
  assert.equal(dashboard.autoChecks.find((check) => check.id === 'two-directors').passed, true);
  assert.equal(JSON.stringify(dashboard).includes(STAFF.id), false);
  assert.equal(dashboard.privacy.performanceTracking, false);
  assert.equal(dashboard.privacy.durationTracking, false);
  assert.equal(buildRealmRehearsalRemediation({ gates: [] }).length, 0);
});

test('Phase 17 checker can reject with a reason and maker receives the ERP notification', async () => {
  const fixture = database();
  const ready = await createAndAttestAll(fixture);
  const submitted = await transitionRealmPilotRehearsal(fixture.db, MAKER, { action: 'submit', runId: ready.runId, expectedVersion: ready.version }, { now: NOW });
  const rejected = await transitionRealmPilotRehearsal(fixture.db, CHECKER, { action: 'reject', runId: ready.runId, expectedVersion: submitted.rehearsals.version, note: 'Retest mobile landscape' }, { now: NOW });
  assert.equal(rejected.run.status, 'draft');
  assert.equal(rejected.run.decisionNote, 'Retest mobile landscape');
  assert.equal(fixture.notifications.at(-1).userId, MAKER.id);
  assert.equal(fixture.notifications.at(-1).route, '/settings#realm-pilot-rehearsal-title');
});
