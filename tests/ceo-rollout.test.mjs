import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCeoIdentitySecret } from '../lib/ceo-identity.js';
import {
  CEO_ROLLOUT_RING_ORDER,
  assertCeoProductionRolloutApproval,
  assertCeoRolloutCapability,
  evaluateCeoRolloutEvidence,
  normalizeCeoRolloutEvidence,
  readCeoRolloutApproval,
  requiredCeoRolloutEvidence,
} from '../lib/ceo-rollout.js';
import { recordCeoRolloutEvidence, transitionCeoRollout } from '../lib/ceo-rollout-admin.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-22T05:00:00.000Z');
const HASH_SECRET = 'ceo-rollout-test-hash-secret-that-is-long-enough';
const RAW_SESSION = 'ceo-rollout-session-token-that-is-long-enough';
const USER = { id: 'director-1', name: 'Vũ Lương Sơn', email: 'ceo@example.test', roles: ['DIRECTOR'] };

function evidence(kind, ring, { actor = 'checker-1', createdAt = NOW } = {}) {
  return {
    id: `${ring}-${kind}`,
    entityId: 'aim',
    ring,
    kind,
    reference: `artifact://${kind}/manifest.json`,
    checksum: `sha256:${kind.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'a')}`,
    observedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60_000),
    recordedById: actor,
    recordedByName: actor,
    createdAt,
  };
}

function fixture() {
  const identity = { id: 'identity-1', userId: USER.id, subject: 'ceo-subject-1', status: 'active' };
  const session = {
    id: 'session-1', identityId: identity.id, identity,
    tokenHash: hashCeoIdentitySecret(RAW_SESSION, HASH_SECRET),
    revokedAt: null, stepUpAt: NOW, lastSeenAt: NOW,
    idleExpiresAt: new Date(NOW.getTime() + 30 * 60_000), expiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000),
  };
  const entity = { id: 'aim', displayName: 'AIm Agency', environment: 'production' };
  const state = { entityId: 'aim', currentRing: 'local_staging', status: 'hold', recordVersion: 1, lastTransitionAt: null, lastReconciledAt: null, lastRollbackAt: null };
  const store = { evidence: [], receipts: [], audits: [] };
  let sequence = 0;
  const apply = (row, data) => {
    for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && Object.hasOwn(value, 'increment') ? Number(row[key] || 0) + value.increment : value;
    return row;
  };
  const db = {
    $transaction: async (operation) => operation(db),
    ceoPortalSession: { findUnique: async ({ where }) => where.tokenHash === session.tokenHash ? session : null, updateMany: async () => ({ count: 1 }) },
    ceoEntityRegistry: { findUnique: async ({ where }) => where.id === entity.id ? entity : null },
    ceoRolloutState: {
      findUnique: async ({ where }) => where.entityId === state.entityId ? { ...state } : null,
      updateMany: async ({ where, data }) => {
        if (where.entityId !== state.entityId || where.recordVersion !== state.recordVersion) return { count: 0 };
        apply(state, data); return { count: 1 };
      },
    },
    ceoRolloutEvidence: {
      findMany: async ({ where }) => store.evidence.filter((row) => row.entityId === where.entityId && row.ring === where.ring && row.expiresAt > where.expiresAt.gt),
      create: async ({ data }) => { const row = { id: `evidence-${++sequence}`, ...data }; store.evidence.push(row); return row; },
    },
    ceoRolloutReceipt: { create: async ({ data }) => { const row = { id: `receipt-${++sequence}`, ...data }; store.receipts.push(row); return row; } },
    auditLog: { create: async ({ data }) => { store.audits.push(data); return data; } },
  };
  return { db, entity, state, store };
}

function approval(maxRing = 'commands') {
  return {
    decision: 'GO', id: 'CHANGE-CEO9-001', allowedEntities: ['aim'], maxRing,
    expiresAt: new Date(NOW.getTime() + 60 * 60_000), commandCanaryEntity: 'aim', active: true,
  };
}

test('CEO-9 rollout order is monotonic and every ring requires backup, canary, reconciliation and rollback evidence', () => {
  assert.deepEqual(CEO_ROLLOUT_RING_ORDER, ['local_staging', 'read_only', 'ceo_sso', 'messaging', 'commands']);
  for (const ring of CEO_ROLLOUT_RING_ORDER) {
    const required = requiredCeoRolloutEvidence('aim', ring);
    for (const kind of ['backup', 'restore_test', 'canary', 'reconciliation', 'rollback']) assert.ok(required.includes(kind));
  }
  assert.ok(requiredCeoRolloutEvidence('egolive', 'commands').includes('finance_review'));
});

test('CEO-9 evidence rejects secret-bearing URLs, invalid checksums and stale windows', () => {
  const valid = { ring: 'read_only', kind: 'backup', reference: 'artifact://backup/aim.json', checksum: `sha256:${'a'.repeat(64)}`, observedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), expectedVersion: 1 };
  assert.equal(normalizeCeoRolloutEvidence(valid, { now: NOW }).kind, 'backup');
  assert.throws(() => normalizeCeoRolloutEvidence({ ...valid, reference: 'https://user:secret@example.test/evidence' }, { now: NOW }), (error) => error.code === 'ceo_rollout_evidence_reference_unsafe');
  assert.throws(() => normalizeCeoRolloutEvidence({ ...valid, checksum: 'sha256:bad' }, { now: NOW }), (error) => error.code === 'ceo_rollout_evidence_checksum_invalid');
});

test('CEO-9 production transitions are fail-closed without a scoped change-window approval', () => {
  const entity = { id: 'aim', environment: 'production' };
  const hold = readCeoRolloutApproval({}, NOW);
  assert.equal(hold.active, false);
  assert.throws(() => assertCeoProductionRolloutApproval(entity, 'read_only', hold, NOW), (error) => error.code === 'ceo_rollout_production_hold');
  assert.doesNotThrow(() => assertCeoProductionRolloutApproval(entity, 'local_staging', hold, NOW));
  assert.doesNotThrow(() => assertCeoProductionRolloutApproval(entity, 'read_only', approval('read_only'), NOW));
});

test('CEO-9 capability gate blocks hold/low rings and keeps Egolive finance local', async () => {
  const row = { entityId: 'aim', currentRing: 'read_only', status: 'active', recordVersion: 2 };
  const db = { ceoRolloutState: { findUnique: async () => row } };
  assert.equal((await assertCeoRolloutCapability(db, 'aim', 'dashboard.read', { now: NOW })).ring, 'read_only');
  await assert.rejects(assertCeoRolloutCapability(db, 'aim', 'messaging.send', { now: NOW }), (error) => error.code === 'ceo_rollout_capability_hold');
  row.currentRing = 'commands';
  await assert.rejects(assertCeoRolloutCapability(db, 'egolive', 'command.dispatch', { action: 'payout.settle', now: NOW }), (error) => error.code === 'ceo_rollout_egolive_finance_local_only');
});

test('CEO-9 records evidence with CAS and activates only after complete current-ring evidence', async () => {
  const f = fixture();
  const base = requiredCeoRolloutEvidence('aim', 'local_staging');
  for (const kind of base) {
    const result = await recordCeoRolloutEvidence(f.db, USER, RAW_SESSION, 'aim', {
      ring: 'local_staging', kind, reference: `artifact://${kind}/aim.json`, checksum: `sha256:${'a'.repeat(63)}${base.indexOf(kind)}`,
      observedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60_000).toISOString(), expectedVersion: f.state.recordVersion,
    }, { now: NOW, hashSecret: HASH_SECRET });
    assert.equal(result.recordVersion, f.state.recordVersion);
  }
  const result = await transitionCeoRollout(f.db, USER, RAW_SESSION, 'aim', {
    action: 'activate', targetRing: 'local_staging', expectedVersion: f.state.recordVersion,
    reason: 'Activate the isolated staging adapters.', confirmation: 'ACTIVATE aim local_staging',
  }, { now: NOW, hashSecret: HASH_SECRET, productionApproval: readCeoRolloutApproval({}, NOW) });
  assert.equal(result.state.status, 'active');
  assert.equal(result.targetBusinessDatabaseTouched, false);
  assert.equal(result.deploymentTriggered, false);
  assert.equal(f.store.receipts.length, 1);
});

test('CEO-9 promotes exactly one ring under a scoped approval and rollback returns paused', async () => {
  const f = fixture();
  f.state.status = 'active';
  for (const kind of requiredCeoRolloutEvidence('aim', 'read_only')) f.store.evidence.push(evidence(kind, 'read_only'));
  const promoted = await transitionCeoRollout(f.db, USER, RAW_SESSION, 'aim', {
    action: 'promote', targetRing: 'read_only', expectedVersion: 1,
    reason: 'Start the approved read-only canary.', confirmation: 'PROMOTE aim TO read_only',
  }, { now: NOW, hashSecret: HASH_SECRET, productionApproval: approval('read_only') });
  assert.equal(promoted.state.currentRing, 'read_only');
  assert.equal(promoted.state.status, 'active');
  await assert.rejects(transitionCeoRollout(f.db, USER, RAW_SESSION, 'aim', {
    action: 'promote', targetRing: 'messaging', expectedVersion: 2,
    reason: 'Attempt to skip the CEO SSO ring.', confirmation: 'PROMOTE aim TO messaging',
  }, { now: NOW, hashSecret: HASH_SECRET, productionApproval: approval('commands') }), (error) => error.code === 'ceo_rollout_promotion_order_invalid');
  const rolledBack = await transitionCeoRollout(f.db, USER, RAW_SESSION, 'aim', {
    action: 'rollback', targetRing: 'local_staging', expectedVersion: 2,
    reason: 'Revert the canary after reconciliation.', confirmation: 'ROLLBACK aim TO local_staging',
  }, { now: NOW, hashSecret: HASH_SECRET, productionApproval: readCeoRolloutApproval({}, NOW) });
  assert.equal(rolledBack.state.currentRing, 'local_staging');
  assert.equal(rolledBack.state.status, 'paused');
});

test('CEO-9 command evidence requires a different maker/checker and Egolive finance reviewer', () => {
  const rows = requiredCeoRolloutEvidence('egolive', 'commands').map((kind) => evidence(kind, 'commands', { actor: kind === 'maker_checker' ? USER.id : kind === 'finance_review' ? USER.id : 'checker-1' }));
  const gate = evaluateCeoRolloutEvidence('egolive', 'commands', rows, { now: NOW, transitionActorId: USER.id });
  assert.equal(gate.complete, false);
  assert.deepEqual(gate.notIndependent.sort(), ['finance_review', 'maker_checker']);
});

test('CEO-9 migration, routes and all outbound adapters are wired without deployment APIs', () => {
  const migration = fs.readFileSync(path.join(ROOT, 'prisma/migrations/20260722050000_add_ceo_rollout_control_plane/migration.sql'), 'utf8');
  assert.match(migration, /local_staging/);
  assert.match(migration, /CeoRolloutReceipt/);
  assert.doesNotMatch(migration, /Task|Invoice|Payout|LiveSession/);
  for (const file of [
    'lib/ceo-unified-dashboard-admin.js', 'lib/ceo-identity-admin.js', 'lib/ceo-messaging-admin.js',
    'lib/ceo-federation-admin.js', 'lib/ceo-command-gateway-admin.js',
  ]) assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /assertCeoRolloutCapability/);
  for (const file of [
    'app/api/ceo/v1/rollout/route.js', 'app/api/ceo/v1/rollout/evidence/route.js',
    'app/api/ceo/v1/rollout/[entityId]/transition/route.js', 'app/(app)/ceo-rollout/page.jsx',
  ]) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  const page = fs.readFileSync(path.join(ROOT, 'app/(app)/ceo-rollout/page.jsx'), 'utf8');
  assert.match(page, /targetBusinessDatabaseTouched|không deploy|does not deploy/);
});
