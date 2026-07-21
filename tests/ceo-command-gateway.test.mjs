import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CEO_COMMAND_CONTRACT,
  CEO_COMMAND_DEFINITIONS,
  CEO_COMMAND_RECEIPT_CONTRACT,
  hashCeoCommandPayload,
  normalizeCeoCommandEnvelope,
  sanitizeCeoCommandReceipt,
} from '../lib/ceo-command-gateway.js';
import { executeCeoEntityCommand } from '../lib/ceo-command-target-admin.js';
import { dispatchCeoCommand, reconcileCeoCommand } from '../lib/ceo-command-gateway-admin.js';
import { hashCeoIdentitySecret } from '../lib/ceo-identity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-22T01:00:00.000Z');
const DIRECTOR = { id: 'apikey:ceo', name: 'API CEO Gateway', roles: ['DIRECTOR'] };
const HASH_SECRET = 'ceo-command-test-hash-secret-at-least-32-characters';
const RAW_SESSION = 'ceo_command_browser_session_token_1234567890';

function envelope(action, payload, overrides = {}) {
  const definition = CEO_COMMAND_DEFINITIONS.find((item) => item.action === action);
  return {
    contract: CEO_COMMAND_CONTRACT,
    version: 1,
    targetEntityId: 'aim',
    actorSubject: 'ceo_global_subject',
    action,
    scope: definition.scope,
    idempotencyKey: `ceo-command:${action.replace('.', '-')}:0001`,
    correlationId: `ceo-correlation:${action.replace('.', '-')}:0001`,
    payload,
    ...overrides,
  };
}

function targetFixture() {
  const state = { tasks: [], approvals: [], notifications: [], changes: [], receipts: [], audits: [], emitted: [] };
  const users = [
    { id: 'staff-1', email: 'staff@aim.test', name: 'Staff One', role: 'STAFF', roles: '["STAFF"]', status: 'active', userType: 'employee' },
    { id: 'pm-1', email: 'pm@aim.test', name: 'Project Manager', role: 'PM', roles: '["PM"]', status: 'active', userType: 'employee' },
  ];
  let id = 0;
  const db = {
    $transaction: async (fn) => fn(db),
    ceoEntityCommandReceipt: {
      findUnique: async ({ where }) => state.receipts.find((row) => row.idempotencyKey === where.idempotencyKey || row.correlationId === where.correlationId) || null,
      create: async ({ data }) => { const row = { id: `receipt-${++id}`, ...data }; state.receipts.push(row); return row; },
    },
    user: {
      findUnique: async ({ where }) => users.find((row) => row.email === where.email) || null,
      findMany: async () => users,
    },
    project: { findUnique: async ({ where }) => where.id === 'project-1' ? { id: 'project-1' } : null },
    task: { create: async ({ data }) => { const row = { id: `task-${++id}`, ...data }; state.tasks.push(row); return row; } },
    approval: { create: async ({ data }) => { const row = { id: `approval-${++id}`, ...data }; state.approvals.push(row); return row; } },
    notification: { createMany: async ({ data }) => { state.notifications.push(...data); return { count: data.length }; } },
    realmChangeEvent: {
      create: async ({ data }) => { state.changes.push(data); return data; },
      createMany: async ({ data }) => { state.changes.push(...data); return { count: data.length }; },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  const emitImpl = async (resource, event, row) => state.emitted.push({ resource, event, row });
  return { db, state, emitImpl };
}

function portalFixture() {
  const entity = {
    id: 'aim', displayName: 'AIm Agency', baseUrl: 'https://aim.example.test', enabled: true,
    status: 'ready', credentialRef: 'CEO_ENTITY_AIM_API_KEY', capabilities: '["delivery","people"]',
    circuitState: 'closed', consecutiveErrors: 0, contractVersion: '1.0.0', schemaVersion: 1,
  };
  const identity = { id: 'identity-1', userId: 'director-1', subject: 'ceo_global_subject', status: 'active' };
  const session = {
    id: 'session-1', identityId: identity.id, identity,
    tokenHash: hashCeoIdentitySecret(RAW_SESSION, HASH_SECRET), revokedAt: null,
    stepUpAt: NOW, lastSeenAt: NOW, idleExpiresAt: new Date(NOW.getTime() + 30 * 60_000), expiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000),
  };
  const membership = {
    id: 'membership-1', identityId: identity.id, entityId: entity.id, status: 'active', localRole: 'DIRECTOR',
    scopes: JSON.stringify(CEO_COMMAND_DEFINITIONS.map((item) => item.scope)),
  };
  const state = { deliveries: [], audits: [], entity };
  let id = 0;
  const applyData = (row, data) => {
    for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && Object.hasOwn(value, 'increment') ? Number(row[key] || 0) + value.increment : value;
    row.updatedAt = NOW;
    return row;
  };
  const db = {
    $transaction: async (fn) => fn(db),
    ceoPortalSession: {
      findUnique: async ({ where }) => where.tokenHash === session.tokenHash ? session : null,
      updateMany: async () => ({ count: 1 }),
    },
    ceoEntityRegistry: {
      findUnique: async ({ where }) => where.id === entity.id ? state.entity : null,
      update: async ({ data }) => applyData(state.entity, data),
      updateMany: async ({ data }) => { applyData(state.entity, data); return { count: 1 }; },
    },
    ceoEntityMembership: { findUnique: async () => membership },
    ceoCommandDelivery: {
      findUnique: async ({ where }) => state.deliveries.find((row) => row.idempotencyKeyHash === where.idempotencyKeyHash || row.correlationId === where.correlationId) || null,
      findFirst: async ({ where }) => state.deliveries.find((row) => row.id === where.id && row.identityId === where.identityId) || null,
      findMany: async () => state.deliveries,
      create: async ({ data }) => {
        const row = { id: `delivery-${++id}`, ...data, createdAt: data.createdAt || NOW, updatedAt: NOW, entity };
        state.deliveries.push(row); return row;
      },
      update: async ({ where, data }) => applyData(state.deliveries.find((row) => row.id === where.id), data),
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  const user = { id: 'director-1', name: 'Vũ Lương Sơn', roles: ['DIRECTOR'] };
  const context = {
    now: NOW, hashSecret: HASH_SECRET,
    secretResolver: () => 'entity-command-api-key-at-least-24-chars',
    allowedOriginResolver: () => ['https://aim.example.test'], timeoutMs: 20,
  };
  return { db, state, entity, identity, session, user, context };
}

function canonicalReceipt(command, id = 'target-receipt-1') {
  return {
    contract: CEO_COMMAND_RECEIPT_CONTRACT,
    version: 1,
    receipt: {
      id, targetEntityId: command.targetEntityId, actorSubject: command.actorSubject,
      action: command.action, scope: command.scope, correlationId: command.correlationId,
      resource: command.action === 'approval.request' ? 'approvals' : command.action === 'announcement.send' ? 'notifications' : 'tasks',
      recordId: command.action === 'announcement.send' ? null : 'record-1', resultCount: 1,
      committedAt: NOW.toISOString(), replayed: false,
    },
    repository: {
      name: 'RepositoryRealms', receiptId: id,
      invariants: { authorization: 'enforced', businessRules: 'enforced', receipt: 'verified', audit: 'atomic' },
    },
  };
}

test('CEO-5 command contract rejects unknown actions, unknown payload fields and scope confusion', () => {
  assert.equal(CEO_COMMAND_DEFINITIONS.length, 4);
  assert.throws(() => normalizeCeoCommandEnvelope(envelope('task.create', { title: 'Create report', amount: 10 })), (error) => error.code === 'ceo_command_payload_unknown_field');
  assert.throws(() => normalizeCeoCommandEnvelope({ ...envelope('task.create', { title: 'Create report' }), scope: 'command.approval.request' }), (error) => error.code === 'ceo_command_scope_mismatch');
  assert.throws(() => normalizeCeoCommandEnvelope({ ...envelope('task.create', { title: 'Create report' }), action: 'payroll.write' }), (error) => error.code === 'ceo_command_unsupported');
  assert.equal(hashCeoCommandPayload({ b: 2, a: 1 }), hashCeoCommandPayload({ a: 1, b: 2 }));
});

test('target entity atomically creates a task, canonical receipt and payload-free audit; replay is idempotent', async () => {
  const { db, state, emitImpl } = targetFixture();
  const input = envelope('task.create', { title: 'Create campaign report', assigneeEmail: 'staff@aim.test', projectId: 'project-1', priority: 'high', estHours: 4 });
  const result = await executeCeoEntityCommand(db, DIRECTOR, input, NOW, { entityId: 'aim', enabledCapabilities: ['delivery'], emitImpl });
  assert.equal(result.receipt.resource, 'tasks');
  assert.equal(state.tasks.length, 1);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.audits.length, 1);
  assert.doesNotMatch(state.audits[0].detail, /Create campaign report|staff@aim\.test/);
  assert.equal(state.emitted.length, 1);
  const replay = await executeCeoEntityCommand(db, DIRECTOR, input, NOW, { entityId: 'aim', enabledCapabilities: ['delivery'], emitImpl });
  assert.equal(replay.idempotent, true);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.emitted.length, 1);
  await assert.rejects(
    executeCeoEntityCommand(db, DIRECTOR, { ...input, payload: { ...input.payload, title: 'Different task' } }, NOW, { entityId: 'aim', enabledCapabilities: ['delivery'], emitImpl }),
    (error) => error.code === 'ceo_command_idempotency_conflict',
  );
});

test('target announcement and approval remain local, bounded and side-effect free for finance', async () => {
  const announcement = targetFixture();
  const announced = await executeCeoEntityCommand(announcement.db, DIRECTOR, envelope('announcement.send', { title: 'Town hall', message: 'Meet at 15:00', audience: 'all' }), NOW, { entityId: 'aim', enabledCapabilities: ['people'], emitImpl: null });
  assert.equal(announced.receipt.resultCount, 2);
  assert.equal(announcement.state.notifications.length, 2);
  const approval = targetFixture();
  const requested = await executeCeoEntityCommand(approval.db, DIRECTOR, envelope('approval.request', { title: 'Approve launch copy', note: 'Review final wording', approverRole: 'PM' }), NOW, { entityId: 'aim', enabledCapabilities: ['people'], emitImpl: null });
  assert.equal(requested.receipt.resource, 'approvals');
  assert.equal(approval.state.approvals[0].status, 'pending');
  assert.equal(approval.state.approvals[0].amount, 0);
  assert.equal(approval.state.approvals[0].type, 'ceo_request');
});

test('Portal stores only delivery metadata and validates RepositoryRealms evidence', async () => {
  const fixture = portalFixture();
  const input = { targetEntityId: 'aim', action: 'task.create', idempotencyKey: 'ceo-command:portal:0001', correlationId: 'ceo-correlation:portal:0001', payload: { title: 'Local-only title', assigneeEmail: 'staff@aim.test' } };
  fixture.context.fetchImpl = async (_url, options) => {
    const command = JSON.parse(options.body);
    return new Response(JSON.stringify(canonicalReceipt(command)), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await dispatchCeoCommand(fixture.db, fixture.user, RAW_SESSION, input, fixture.context);
  assert.equal(result.delivery.status, 'delivered', JSON.stringify(result.delivery));
  assert.equal(result.delivery.receipt.id, 'target-receipt-1');
  assert.equal(JSON.stringify(fixture.state.deliveries).includes('Local-only title'), false);
  assert.equal(JSON.stringify(fixture.state.deliveries).includes('staff@aim.test'), false);
  assert.equal(fixture.state.deliveries[0].payloadHash.length, 64);
  assert.equal(fixture.state.deliveries[0].idempotencyKeyHash.length, 64);
  assert.equal(JSON.stringify(fixture.state.deliveries).includes(input.idempotencyKey), false);
});

test('timeout degrades to pending confirmation and receipt reconciliation never resends the business command', async () => {
  const fixture = portalFixture();
  const input = { targetEntityId: 'aim', action: 'status.request', idempotencyKey: 'ceo-command:portal:timeout', correlationId: 'ceo-correlation:portal:timeout', payload: { topic: 'Launch status', message: 'Please update', targetEmail: 'staff@aim.test' } };
  let posts = 0;
  fixture.context.fetchImpl = async () => { posts += 1; const error = new Error('timeout'); error.name = 'AbortError'; throw error; };
  const pending = await dispatchCeoCommand(fixture.db, fixture.user, RAW_SESSION, input, fixture.context);
  assert.equal(pending.delivery.status, 'pending_confirmation', JSON.stringify(pending.delivery));
  assert.equal(posts, 1);
  const command = normalizeCeoCommandEnvelope({ contract: CEO_COMMAND_CONTRACT, version: 1, targetEntityId: 'aim', actorSubject: fixture.identity.subject, action: input.action, scope: 'command.status.request', idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, payload: input.payload });
  fixture.context.fetchImpl = async (_url, options) => {
    assert.equal(options.method, 'GET');
    return new Response(JSON.stringify(canonicalReceipt(command, 'target-receipt-timeout')), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const reconciled = await reconcileCeoCommand(fixture.db, fixture.user, RAW_SESSION, pending.delivery.id, fixture.context);
  assert.equal(reconciled.delivery.status, 'delivered');
  assert.equal(reconciled.delivery.receipt.id, 'target-receipt-timeout');
  assert.equal(posts, 1, 'reconciliation must not POST the command again');
});

test('receipt sanitizer fails closed on audience or invariant mismatch', () => {
  const command = normalizeCeoCommandEnvelope(envelope('task.create', { title: 'Create report' }));
  assert.throws(() => sanitizeCeoCommandReceipt({ ...canonicalReceipt(command), receipt: { ...canonicalReceipt(command).receipt, targetEntityId: 'egoric' } }, command), (error) => error.code === 'ceo_command_receipt_mismatch');
  assert.throws(() => sanitizeCeoCommandReceipt({ ...canonicalReceipt(command), repository: { name: 'Unknown' } }, command), (error) => error.code === 'ceo_command_repository_evidence_missing');
});

test('CEO-5 routes, schema and UI expose the constrained gateway without a direct database client', () => {
  const portalRoute = fs.readFileSync(path.join(root, 'app/api/ceo/v1/command-gateway/route.js'), 'utf8');
  const targetRoute = fs.readFileSync(path.join(root, 'app/api/ceo/v1/commands/route.js'), 'utf8');
  const reconcileRoute = fs.readFileSync(path.join(root, 'app/api/ceo/v1/command-gateway/[id]/reconcile/route.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'app/(app)/ceo-commands/page.jsx'), 'utf8');
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260722010000_add_ceo_command_gateway/migration.sql'), 'utf8');
  assert.match(portalRoute, /ceoRequestIsSameOrigin/);
  assert.match(portalRoute, /readCeoPortalSessionCookie/);
  assert.match(targetRoute, /apiUser\(request\)/);
  assert.match(targetRoute, /executeRepositoryRealmsAction/);
  assert.match(reconcileRoute, /reconcileCeoCommand/);
  assert.match(page, /DELIVERY METADATA ONLY/);
  assert.match(page, /CEO-5 does not allow Finance or Payroll writes/);
  assert.match(schema, /model CeoCommandDelivery/);
  assert.match(schema, /model CeoEntityCommandReceipt/);
  assert.doesNotMatch(migration, /"payload"\s+TEXT/);
  assert.doesNotMatch(portalRoute, /prisma\.(task|approval|notification)\./);
});
