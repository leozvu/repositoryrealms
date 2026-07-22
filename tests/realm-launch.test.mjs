import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmLaunchPreview, verifyRealmLaunchApplication } from '../lib/realm-launch.js';
import {
  classifyRealmLaunchChange,
  createRealmLaunchPreviewToken,
  realmLaunchPolicyDigest,
  verifyRealmLaunchPreviewToken,
} from '../lib/realm-launch-token.js';
import { normalizeRealmPilotConfig, saveRealmPilotConfig } from '../lib/realm-pilot.js';

const SECRET = 'phase-14-test-secret-long-enough';
const NOW = new Date('2026-07-19T14:00:00.000Z');
const DIRECTOR = { id: 'director-1', name: 'Director', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee' };
const STAFF = { id: 'staff-1', name: 'Staff', role: 'STAFF', roles: '["STAFF"]', status: 'active', userType: 'employee' };

function policy(value) {
  return normalizeRealmPilotConfig(value);
}

test('Phase 14 classifies rollout expansion, restriction, operational and emergency changes', () => {
  const off = policy({ mode: 'off', roles: ['STAFF'] });
  const pilot = policy({ mode: 'pilot', roles: ['STAFF'] });
  const widerPilot = policy({ mode: 'pilot', roles: ['STAFF', 'PM'] });
  const tourOnly = policy({ ...pilot, onboardingVersion: 2 });
  assert.equal(classifyRealmLaunchChange(off, pilot), 'expansion');
  assert.equal(classifyRealmLaunchChange(widerPilot, pilot), 'restriction');
  assert.equal(classifyRealmLaunchChange(pilot, tourOnly), 'operational');
  assert.equal(classifyRealmLaunchChange(pilot, { ...pilot, mode: 'off' }), 'emergency');
  assert.equal(classifyRealmLaunchChange(policy({ mode: 'open' }), pilot), 'restriction');
});

test('signed preview is bound to actor, version, exact draft and expiry', () => {
  const currentPolicy = policy({ mode: 'off', version: 4 });
  const draftPolicy = policy({ mode: 'pilot', roles: ['STAFF'], version: 4 });
  const signed = createRealmLaunchPreviewToken({
    actorId: DIRECTOR.id,
    currentPolicy,
    draftPolicy,
    readiness: { ready: true, summary: { blockers: 0 } },
    impact: { eligibleUsers: 3, fallbackUsers: 7 },
    secret: SECRET,
    now: NOW,
  });
  const verified = verifyRealmLaunchPreviewToken({
    token: signed.token,
    actorId: DIRECTOR.id,
    currentPolicy,
    draftPolicy,
    secret: SECRET,
    now: new Date(NOW.getTime() + 30_000),
  });
  assert.equal(verified.previewId, signed.previewId);
  assert.equal(verified.risk, 'expansion');
  assert.equal(verified.eligibleUsers, 3);
  assert.equal(verified.fallbackUsers, 7);

  assert.throws(
    () => verifyRealmLaunchPreviewToken({ token: signed.token, actorId: 'other', currentPolicy, draftPolicy, secret: SECRET, now: NOW }),
    (error) => error.code === 'realm_launch_preview_actor_mismatch',
  );
  assert.throws(
    () => verifyRealmLaunchPreviewToken({ token: signed.token, actorId: DIRECTOR.id, currentPolicy, draftPolicy: { ...draftPolicy, defaultSurface: 'realm' }, secret: SECRET, now: NOW }),
    (error) => error.code === 'realm_launch_preview_draft_mismatch',
  );
  assert.throws(
    () => verifyRealmLaunchPreviewToken({ token: signed.token, actorId: DIRECTOR.id, currentPolicy, draftPolicy, secret: SECRET, now: new Date(NOW.getTime() + 11 * 60_000) }),
    (error) => error.code === 'realm_launch_preview_expired',
  );
  assert.throws(
    () => verifyRealmLaunchPreviewToken({ token: `${signed.token}x`, actorId: DIRECTOR.id, currentPolicy, draftPolicy, secret: SECRET, now: NOW }),
    (error) => error.code === 'realm_launch_preview_invalid',
  );
});

test('expansion preview with blocking gates cannot authorize apply', () => {
  const currentPolicy = policy({ mode: 'off' });
  const draftPolicy = policy({ mode: 'pilot', roles: ['STAFF'] });
  const signed = createRealmLaunchPreviewToken({
    actorId: DIRECTOR.id,
    currentPolicy,
    draftPolicy,
    readiness: { ready: false, summary: { blockers: 2 } },
    impact: { eligibleUsers: 1, fallbackUsers: 1 },
    secret: SECRET,
    now: NOW,
  });
  assert.throws(
    () => verifyRealmLaunchPreviewToken({ token: signed.token, actorId: DIRECTOR.id, currentPolicy, draftPolicy, secret: SECRET, now: NOW }),
    (error) => error.code === 'realm_launch_readiness_blocked',
  );
});

test('expansion rechecks live readiness inside apply and rejects a new blocker', async () => {
  const currentPolicy = policy({ mode: 'off' });
  const draftPolicy = policy({ mode: 'pilot', roles: ['STAFF'] });
  const signed = createRealmLaunchPreviewToken({
    actorId: DIRECTOR.id,
    currentPolicy,
    draftPolicy,
    readiness: { ready: true, summary: { blockers: 0 } },
    impact: { eligibleUsers: 1, fallbackUsers: 1 },
    secret: SECRET,
    now: NOW,
  });
  let rawCalls = 0;
  let ticketCalls = 0;
  const db = {
    user: { findMany: async () => [{ ...STAFF, workspacePreference: 'auto' }] },
    collaborationPresenceSession: { findMany: async () => [] },
    ticket: { count: async () => { ticketCalls += 1; return ticketCalls === 2 ? 1 : 0; } },
    $queryRaw: async () => {
      rawCalls += 1;
      return rawCalls === 1
        ? [{ userTable: true, collaborationTable: true, changeFeedTable: true, actionReceiptTable: true, pilotPreferenceColumn: true, pilotFeedbackColumns: true, migrationTable: true }]
        : [{ applied: true }];
    },
  };
  await assert.rejects(
    () => verifyRealmLaunchApplication(db, DIRECTOR, { token: signed.token, currentPolicy, draftPolicy, secret: SECRET, now: NOW }),
    (error) => error.code === 'realm_launch_readiness_stale',
  );
});

test('launch preview returns aggregate impact without a roster or parallel write', async () => {
  let rawCalls = 0;
  const db = {
    setting: { findUnique: async () => ({ json: JSON.stringify({ realmPilot: policy({ mode: 'off' }) }) }) },
    user: { findMany: async () => [
      { ...DIRECTOR, workspacePreference: 'auto' },
      { ...STAFF, workspacePreference: 'realm' },
    ] },
    collaborationPresenceSession: { findMany: async () => [] },
    ticket: { count: async () => 0 },
    $queryRaw: async () => {
      rawCalls += 1;
      return rawCalls === 1
        ? [{ userTable: true, collaborationTable: true, changeFeedTable: true, actionReceiptTable: true, pilotPreferenceColumn: true, pilotFeedbackColumns: true, migrationTable: true }]
        : [{ applied: true }];
    },
  };
  const preview = await createRealmLaunchPreview(db, DIRECTOR, policy({ mode: 'pilot', roles: ['STAFF'], version: 0 }), { secret: SECRET, now: NOW });
  assert.equal(preview.source, 'erp');
  assert.equal(preview.preview.risk, 'expansion');
  assert.equal(preview.preview.impact.activeInternalUsers, 2);
  assert.equal(preview.preview.impact.eligibleUsers, 1);
  assert.equal(preview.preview.impact.fallbackUsers, 1);
  assert.equal(preview.preview.privacy.rosterIncluded, false);
  assert.equal(preview.preview.privacy.performanceTracking, false);
  assert.equal(JSON.stringify(preview.preview).includes('staff-1'), false);
  assert.equal(preview.preview.draftDigest, realmLaunchPolicyDigest(policy({ mode: 'pilot', roles: ['STAFF'], version: 0 })));
});

test('server save requires the matching preview while kill switch stays unconditional', async () => {
  const calls = { audits: [], saved: [] };
  let currentPolicy = policy({ mode: 'off' });
  const tx = {
    setting: {
      findUnique: async () => ({ json: JSON.stringify({ company: 'Keep', realmPilot: currentPolicy }) }),
      upsert: async (value) => { calls.saved.push(JSON.parse(value.update.json).realmPilot); },
    },
    user: { findMany: async () => [{ id: STAFF.id }] },
    auditLog: { create: async (value) => { calls.audits.push(value.data); } },
  };
  const db = { $transaction: async (operation) => operation(tx) };
  const draftPolicy = policy({ mode: 'pilot', roles: ['STAFF'], version: 0 });
  await assert.rejects(
    () => saveRealmPilotConfig(db, DIRECTOR, draftPolicy, { requireLaunchPreview: true }),
    (error) => error.code === 'realm_launch_preview_required',
  );
  const signed = createRealmLaunchPreviewToken({
    actorId: DIRECTOR.id,
    currentPolicy,
    draftPolicy,
    readiness: { ready: true, summary: { blockers: 0 } },
    impact: { eligibleUsers: 1, fallbackUsers: 1 },
    secret: SECRET,
    now: NOW,
  });
  const saved = await saveRealmPilotConfig(db, DIRECTOR, draftPolicy, {
    requireLaunchPreview: true,
    verifyLaunchPreview: ({ currentPolicy: savedCurrent, draftPolicy: savedDraft }) => verifyRealmLaunchPreviewToken({
      token: signed.token,
      actorId: DIRECTOR.id,
      currentPolicy: savedCurrent,
      draftPolicy: savedDraft,
      secret: SECRET,
      now: NOW,
    }),
  });
  assert.equal(saved.mode, 'pilot');
  assert.match(calls.audits.at(-1).detail, new RegExp(`launch ${signed.previewId}; risk expansion; eligible 1; fallback 1`));

  currentPolicy = saved;
  const disabled = await saveRealmPilotConfig(db, DIRECTOR, { ...saved, mode: 'off' }, { requireLaunchPreview: true });
  assert.equal(disabled.mode, 'off');
  assert.match(calls.audits.at(-1).detail, /launch kill-switch; risk emergency/);
});
