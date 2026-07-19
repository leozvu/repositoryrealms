import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealmLaunchApproval,
  decideRealmLaunchApproval,
  listRealmLaunchApprovals,
} from '../lib/realm-launch-approval.js';
import { createRealmLaunchPreviewToken } from '../lib/realm-launch-token.js';
import { normalizeRealmPilotConfig } from '../lib/realm-pilot.js';

const SECRET = 'phase-15-four-eyes-test-secret';
const NOW = new Date('2026-07-19T15:00:00.000Z');
const MAKER = { id: 'director-maker', name: 'Maker', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee' };
const CHECKER = { id: 'director-checker', name: 'Checker', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee' };
const STAFF = { id: 'staff-private-id', name: 'Staff', role: 'STAFF', roles: '["STAFF"]', status: 'active', userType: 'employee', workspacePreference: 'auto' };

function readyPreview(currentPolicy, draftPolicy) {
  return createRealmLaunchPreviewToken({
    actorId: MAKER.id,
    currentPolicy,
    draftPolicy,
    readiness: { ready: true, summary: { blockers: 0 } },
    impact: { eligibleUsers: 1, fallbackUsers: 2 },
    secret: SECRET,
    now: NOW,
  });
}

function database({ blocked = false } = {}) {
  const approvals = [];
  const audits = [];
  let setting = { company: 'Keep ERP', realmPilot: normalizeRealmPilotConfig({ mode: 'off', version: 0 }) };
  let rawCall = 0;
  const tx = {
    setting: {
      findUnique: async () => ({ json: JSON.stringify(setting) }),
      upsert: async ({ update }) => { setting = JSON.parse(update.json); },
    },
    approval: {
      findFirst: async ({ where }) => approvals.find((row) => row.type === where.type && row.refId === where.refId && row.status === where.status) || null,
      create: async ({ data }) => {
        const row = { id: `approval-${approvals.length + 1}`, createdAt: NOW, decidedAt: null, ...data };
        approvals.push(row);
        return { ...row };
      },
      findUnique: async ({ where }) => {
        const row = approvals.find((item) => item.id === where.id);
        return row ? { ...row } : null;
      },
      findMany: async () => approvals.map((row) => ({ ...row })),
      updateMany: async ({ where, data }) => {
        const row = approvals.find((item) => item.id === where.id && item.status === where.status && item.steps === where.steps);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    user: { findMany: async ({ where } = {}) => where?.id?.in ? [STAFF] : [MAKER, CHECKER, STAFF] },
    collaborationPresenceSession: { findMany: async () => [] },
    ticket: { count: async () => blocked ? 1 : 0 },
    $queryRaw: async () => {
      rawCall += 1;
      return rawCall % 2 === 1
        ? [{ userTable: true, collaborationTable: true, changeFeedTable: true, actionReceiptTable: true, pilotPreferenceColumn: true, pilotFeedbackColumns: true, migrationTable: true }]
        : [{ applied: true }];
    },
  };
  return {
    db: { ...tx, $transaction: async (operation) => operation(tx) },
    approvals,
    audits,
    setBlocked(value) { blocked = value; },
    currentPolicy() { return setting.realmPilot; },
  };
}

async function createPendingApproval(fixture) {
  const currentPolicy = fixture.currentPolicy();
  const draftPolicy = normalizeRealmPilotConfig({
    mode: 'pilot',
    cohortStrategy: 'members',
    memberIds: [STAFF.id],
    roles: [],
    defaultSurface: 'erp',
    version: currentPolicy.version,
  });
  const signed = readyPreview(currentPolicy, draftPolicy);
  const approval = await createRealmLaunchApproval(fixture.db, MAKER, draftPolicy, {
    token: signed.token,
    secret: SECRET,
    now: NOW,
  });
  return { approval, draftPolicy };
}

test('Phase 15 stores expansion policy encrypted and exposes aggregate-only approval summaries', async () => {
  const fixture = database();
  const { approval } = await createPendingApproval(fixture);
  assert.equal(approval.status, 'pending');
  assert.equal(approval.impact.eligibleUsers, 1);
  assert.equal(approval.privacy.rosterIncluded, false);
  assert.match(fixture.approvals[0].payload, /^realm-launch-v1\./);
  assert.equal(fixture.approvals[0].payload.includes(STAFF.id), false);

  const board = await listRealmLaunchApprovals(fixture.db, CHECKER, { secret: SECRET });
  assert.equal(board.toReview.length, 1);
  assert.equal(board.toReview[0].payloadReadable, true);
  assert.equal(JSON.stringify(board).includes(STAFF.id), false);
});

test('Phase 15 forbids self approval and a different Director atomically applies the ERP Setting', async () => {
  const fixture = database();
  const { approval } = await createPendingApproval(fixture);
  await assert.rejects(
    () => decideRealmLaunchApproval(fixture.db, MAKER, { approvalId: approval.id, decision: 'approve', secret: SECRET, now: NOW }),
    (error) => error.code === 'self_approval_forbidden',
  );
  assert.equal(fixture.currentPolicy().mode, 'off');

  const result = await decideRealmLaunchApproval(fixture.db, CHECKER, {
    approvalId: approval.id,
    decision: 'approve',
    secret: SECRET,
    now: new Date(NOW.getTime() + 60_000),
  });
  assert.equal(result.outcome, 'approved');
  assert.equal(result.approval.status, 'approved');
  assert.equal(result.policy.mode, 'pilot');
  assert.equal(fixture.currentPolicy().version, 1);
  assert.match(fixture.audits.find((row) => row.entity === 'realm_pilot').detail, /approval approval-1; maker director-maker/);
  assert.match(fixture.audits.at(-1).detail, /maker director-maker; checker director-checker; no roster/);
});

test('Phase 15 rechecks blockers before claim so failed approval never changes policy or approval status', async () => {
  const fixture = database();
  const { approval } = await createPendingApproval(fixture);
  fixture.setBlocked(true);
  await assert.rejects(
    () => decideRealmLaunchApproval(fixture.db, CHECKER, {
      approvalId: approval.id,
      decision: 'approve',
      secret: SECRET,
      now: new Date(NOW.getTime() + 60_000),
    }),
    (error) => error.code === 'realm_launch_readiness_stale',
  );
  assert.equal(fixture.currentPolicy().mode, 'off');
  assert.equal(fixture.approvals[0].status, 'pending');
});

test('Phase 15 rejects ciphertext tampering without disclosing or applying the policy', async () => {
  const fixture = database();
  const { approval } = await createPendingApproval(fixture);
  fixture.approvals[0].payload = `${fixture.approvals[0].payload.slice(0, -1)}x`;
  await assert.rejects(
    () => decideRealmLaunchApproval(fixture.db, CHECKER, { approvalId: approval.id, decision: 'approve', secret: SECRET, now: NOW }),
    (error) => error.code === 'realm_launch_approval_payload_invalid',
  );
  assert.equal(fixture.currentPolicy().mode, 'off');
  assert.equal(fixture.approvals[0].status, 'pending');

  const rejected = await decideRealmLaunchApproval(fixture.db, CHECKER, {
    approvalId: approval.id,
    decision: 'reject',
    note: 'Đóng proposal không thể xác minh',
    secret: SECRET,
    now: NOW,
  });
  assert.equal(rejected.outcome, 'rejected');
  assert.equal(rejected.approval.payloadReadable, false);
  assert.equal(fixture.approvals[0].status, 'rejected');
});
