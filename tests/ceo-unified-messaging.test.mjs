import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CEO_MESSAGE_CONTRACT,
  CEO_MESSAGE_RECEIPT_CONTRACT,
  decryptCeoMessage,
  encryptCeoMessage,
  normalizeCeoMessageEnvelope,
  sanitizeCeoMessageReceipt,
} from '../lib/ceo-messaging.js';
import { buildLocalCeoDirectory, executeCeoEntityMessage } from '../lib/ceo-messaging-target-admin.js';
import { reconcileCeoMessage, sendCeoMessage } from '../lib/ceo-messaging-admin.js';
import { hashCeoIdentitySecret } from '../lib/ceo-identity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-22T02:00:00.000Z');
const HASH_SECRET = 'ceo-messaging-test-hash-secret-at-least-32-characters';
const MESSAGE_SECRET = 'ceo-messaging-encryption-secret-at-least-32-characters';
const RAW_SESSION = 'ceo_messaging_browser_session_token_1234567890';
const DIRECTOR = { id: 'ceo-local', name: 'Vũ Lương Sơn', roles: ['DIRECTOR'] };

function envelope(overrides = {}) {
  return {
    contract: CEO_MESSAGE_CONTRACT, version: 1, action: 'message.send', scope: 'message.send',
    targetEntityId: 'aim', actorSubject: 'ceo_global_subject', portalConversationId: 'portal-conversation-1',
    conversationType: 'dm', recipientUserId: 'staff-1', idempotencyKey: 'ceo-message:idempotency:0001',
    correlationId: 'ceo-message:correlation:0001', content: 'Please review @staff@aim.test', mentions: [], ...overrides,
  };
}

function targetFixture() {
  const users = [
    { id: 'ceo-local', email: 'ceo@aim.test', name: 'Vũ Lương Sơn', title: 'CEO', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active', userType: 'employee' },
    { id: 'staff-1', email: 'staff@aim.test', name: 'Staff One', title: 'Account', role: 'STAFF', roles: '["STAFF"]', status: 'active', userType: 'employee' },
    { id: 'private-1', email: 'private@aim.test', name: 'Private One', title: 'Designer', role: 'STAFF', roles: '["STAFF"]', status: 'active', userType: 'employee' },
  ];
  const profiles = [{ id: 'profile-1', userId: 'staff-1', sharedWithCeoPortal: true, sharePresence: false, displayName: null, title: null, updatedAt: NOW, user: users[1] }];
  const state = { conversations: [], members: [], messages: [], links: [], receipts: [], notifications: [], changes: [], audits: [] };
  let seq = 0;
  const db = {
    $transaction: async (fn) => fn(db),
    ceoEntityDirectoryProfile: {
      findUnique: async ({ where }) => profiles.find((row) => row.userId === where.userId) || null,
      findMany: async () => profiles,
    },
    user: { findMany: async () => users },
    ceoEntityConversationLink: {
      findUnique: async ({ where }) => state.links.find((row) => row.portalConversationId === where.portalConversationId) || null,
      create: async ({ data }) => { const row = { id: `link-${++seq}`, ...data, createdAt: NOW, updatedAt: NOW }; state.links.push(row); return row; },
    },
    conversation: { create: async ({ data }) => { const row = { id: `conv-${++seq}`, ...data, createdAt: NOW }; state.conversations.push(row); return row; } },
    convMember: {
      createMany: async ({ data }) => { state.members.push(...data.map((row) => ({ id: `member-${++seq}`, lastReadAt: NOW, ...row }))); return { count: data.length }; },
      deleteMany: async ({ where }) => { const keep = state.members.filter((row) => row.convId !== where.convId || !where.userId.notIn.includes(row.userId)); state.members.splice(0, state.members.length, ...keep); return { count: 0 }; },
      findMany: async ({ where }) => state.members.filter((row) => row.convId === where.convId),
    },
    message: {
      create: async ({ data }) => { const row = { id: `message-${++seq}`, ...data }; state.messages.push(row); return row; },
      findMany: async ({ where }) => state.messages.filter((row) => row.convId === where.convId),
    },
    ceoEntityMessageReceipt: {
      findUnique: async ({ where }) => state.receipts.find((row) => row.idempotencyKey === where.idempotencyKey || row.correlationId === where.correlationId) || null,
      create: async ({ data }) => { const row = { id: `receipt-${++seq}`, ...data }; state.receipts.push(row); return row; },
    },
    notification: { createMany: async ({ data }) => { state.notifications.push(...data); return { count: data.length }; } },
    realmChangeEvent: { createMany: async ({ data }) => { state.changes.push(...data); return { count: data.length }; } },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return { db, state };
}

test('CEO-6 encrypts message content with authenticated encryption and fails closed on tampering', () => {
  const encrypted = encryptCeoMessage('Nội dung riêng tư', MESSAGE_SECRET);
  assert.equal(decryptCeoMessage(encrypted, MESSAGE_SECRET), 'Nội dung riêng tư');
  assert.notEqual(encrypted.bodyCiphertext, 'Nội dung riêng tư');
  assert.throws(() => decryptCeoMessage({ ...encrypted, bodyTag: Buffer.alloc(16).toString('base64url') }, MESSAGE_SECRET), (error) => error.code === 'ceo_messaging_decryption_failed');
  assert.throws(() => encryptCeoMessage('hello', 'short'), (error) => error.code === 'ceo_messaging_encryption_unavailable');
});

test('CEO-6 message contract rejects scope confusion, unknown fields and extracts email mentions', () => {
  const normalized = normalizeCeoMessageEnvelope(envelope());
  assert.deepEqual(normalized.mentions, ['staff@aim.test']);
  assert.throws(() => normalizeCeoMessageEnvelope({ ...envelope(), scope: 'finance.write' }), (error) => error.code === 'ceo_messaging_scope_mismatch');
  assert.throws(() => normalizeCeoMessageEnvelope({ ...envelope(), payroll: true }), (error) => error.code === 'ceo_messaging_unknown_field');
});

test('target directory exports only explicitly shared profiles', async () => {
  const { db } = targetFixture();
  const directory = await buildLocalCeoDirectory(db, DIRECTOR, { id: 'aim' }, NOW);
  assert.equal(directory.profiles.length, 1);
  assert.deepEqual(Object.keys(directory.profiles[0]).sort(), ['displayName', 'email', 'sharePresence', 'title', 'updatedAt', 'userId'].sort());
  assert.equal(JSON.stringify(directory).includes('private@aim.test'), false);
});

test('target adapter writes existing Conversation/Message plus receipt, notification and payload-free audit atomically', async () => {
  const { db, state } = targetFixture();
  await assert.rejects(executeCeoEntityMessage(db, DIRECTOR, envelope(), NOW, { entityId: 'aim', messagingEnabled: false }), (error) => error.code === 'ceo_messaging_capability_unavailable');
  const result = await executeCeoEntityMessage(db, DIRECTOR, envelope(), NOW, { entityId: 'aim', messagingEnabled: true });
  assert.equal(result.receipt.localMessageId, state.messages[0].id);
  assert.equal(state.conversations[0].type, 'dm');
  assert.equal(state.members.length, 2);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.changes.length, 1);
  assert.doesNotMatch(state.audits[0].detail, /Please review|staff@aim\.test/);
  const replay = await executeCeoEntityMessage(db, DIRECTOR, envelope(), NOW, { entityId: 'aim', messagingEnabled: true });
  assert.equal(replay.idempotent, true);
  assert.equal(state.messages.length, 1);
  await assert.rejects(executeCeoEntityMessage(db, DIRECTOR, envelope({ content: 'Changed body' }), NOW, { entityId: 'aim', messagingEnabled: true }), (error) => error.code === 'ceo_messaging_idempotency_conflict');
});

function portalFixture() {
  const entity = { id: 'aim', displayName: 'AIm Agency', baseUrl: 'https://aim.example.test', enabled: true, status: 'ready', credentialRef: 'CEO_ENTITY_AIM_API_KEY', capabilities: '["people"]', circuitState: 'closed', consecutiveErrors: 0 };
  const identity = { id: 'identity-1', userId: 'director-1', subject: 'ceo_global_subject', displayName: 'Vũ Lương Sơn', status: 'active' };
  const session = { id: 'session-1', identityId: identity.id, identity, tokenHash: hashCeoIdentitySecret(RAW_SESSION, HASH_SECRET), revokedAt: null, stepUpAt: NOW, lastSeenAt: NOW, idleExpiresAt: new Date(NOW.getTime() + 30 * 60_000), expiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000) };
  const membership = { identityId: identity.id, entityId: entity.id, status: 'active', localRole: 'DIRECTOR', scopes: '["directory.read","message.read","message.send","message.export"]' };
  const conversation = { id: 'portal-conversation-1', identityId: identity.id, entityId: entity.id, entity, type: 'dm', remoteUserId: 'staff-1', name: 'Staff One', status: 'active', retentionUntil: new Date('2027-07-22'), createdAt: NOW, updatedAt: NOW };
  const state = { messages: [], audits: [] }; let seq = 0;
  const apply = (row, data) => { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && Object.hasOwn(value, 'increment') ? Number(row[key] || 0) + value.increment : value; return row; };
  const db = {
    $transaction: async (fn) => fn(db),
    ceoPortalSession: { findUnique: async ({ where }) => where.tokenHash === session.tokenHash ? session : null, updateMany: async () => ({ count: 1 }) },
    ceoEntityMembership: { findMany: async () => [membership], findUnique: async () => membership },
    ceoEntityRegistry: { findUnique: async () => entity, update: async ({ data }) => apply(entity, data), updateMany: async ({ data }) => { apply(entity, data); return { count: 1 }; } },
    ceoRolloutState: { findUnique: async ({ where }) => ({ entityId: where.entityId, currentRing: 'messaging', status: 'active', recordVersion: 4 }) },
    ceoUnifiedConversation: { findFirst: async () => conversation, update: async ({ data }) => apply(conversation, data) },
    ceoUnifiedMessage: {
      findFirst: async ({ where }) => {
        const row = state.messages.find((item) => item.id === where.id && item.direction === where.direction);
        return row ? { ...row, conversation } : null;
      },
      findUnique: async ({ where }) => state.messages.find((row) => (where.idempotencyKeyHash && row.idempotencyKeyHash === where.idempotencyKeyHash) || (where.correlationId && row.correlationId === where.correlationId)) || null,
      create: async ({ data }) => { const row = { id: `portal-message-${++seq}`, ...data, createdAt: data.createdAt || NOW, updatedAt: NOW }; state.messages.push(row); return row; },
      update: async ({ where, data }) => apply(state.messages.find((row) => row.id === where.id), data),
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  const context = { now: NOW, hashSecret: HASH_SECRET, messageSecret: MESSAGE_SECRET, secretResolver: () => 'entity-message-api-key-at-least-24-chars', allowedOriginResolver: () => ['https://aim.example.test'], timeoutMs: 20 };
  return { db, state, entity, identity, conversation, user: { id: 'director-1', name: 'Vũ Lương Sơn', roles: ['DIRECTOR'] }, context };
}

function receiptFor(message) {
  return { contract: CEO_MESSAGE_RECEIPT_CONTRACT, version: 1, receipt: { id: 'message-receipt-1', targetEntityId: message.targetEntityId, actorSubject: message.actorSubject, portalConversationId: message.portalConversationId, correlationId: message.correlationId, localConversationId: 'local-conversation-1', localMessageId: 'local-message-1', committedAt: NOW.toISOString(), replayed: false }, repository: { name: 'RepositoryRealms', receiptId: 'message-receipt-1', invariants: { authorization: 'enforced', businessRules: 'enforced', receipt: 'verified', audit: 'atomic' } } };
}

test('Portal keeps encrypted content and confirms target-owned RepositoryRealms receipt', async () => {
  const fixture = portalFixture();
  fixture.context.fetchImpl = async (_url, options) => { const message = JSON.parse(options.body); return new Response(JSON.stringify(receiptFor(message)), { status: 201, headers: { 'Content-Type': 'application/json' } }); };
  const result = await sendCeoMessage(fixture.db, fixture.user, RAW_SESSION, fixture.conversation.id, { content: 'Confidential launch plan', idempotencyKey: 'ceo-message:portal:0001', correlationId: 'ceo-message:portal-correlation:0001' }, fixture.context);
  assert.equal(result.message.status, 'delivered');
  assert.equal(result.message.content, 'Confidential launch plan');
  assert.equal(fixture.state.messages[0].bodyCiphertext.includes('Confidential launch plan'), false);
  assert.equal(JSON.stringify(fixture.state.audits).includes('Confidential launch plan'), false);
  assert.equal(fixture.state.messages[0].targetReceiptId, 'message-receipt-1');
});

test('Portal degrades a delivery timeout to pending confirmation without plaintext leakage', async () => {
  const fixture = portalFixture();
  fixture.context.fetchImpl = async () => { const error = new Error('timeout'); error.name = 'AbortError'; throw error; };
  const result = await sendCeoMessage(fixture.db, fixture.user, RAW_SESSION, fixture.conversation.id, { content: 'Do not duplicate', idempotencyKey: 'ceo-message:portal:timeout', correlationId: 'ceo-message:portal-correlation:timeout' }, fixture.context);
  assert.equal(result.message.status, 'pending_confirmation');
  assert.equal(fixture.state.messages.length, 1);
  assert.equal(JSON.stringify(fixture.state.audits).includes('Do not duplicate'), false);
});

test('Portal reconciles an uncertain delivery with GET-only receipt lookup and never resends the message', async () => {
  const fixture = portalFixture();
  let postCount = 0;
  fixture.context.fetchImpl = async (_url, options) => {
    if (options.method === 'POST') {
      postCount += 1;
      const error = new Error('timeout');
      error.name = 'AbortError';
      throw error;
    }
    assert.equal(options.method, 'GET');
    const message = envelope({
      portalConversationId: fixture.conversation.id,
      idempotencyKey: 'ceo-message:portal:reconcile',
      correlationId: 'ceo-message:portal-correlation:reconcile',
      content: 'Reconcile once',
    });
    return new Response(JSON.stringify(receiptFor(message)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const sent = await sendCeoMessage(fixture.db, fixture.user, RAW_SESSION, fixture.conversation.id, {
    content: 'Reconcile once',
    idempotencyKey: 'ceo-message:portal:reconcile',
    correlationId: 'ceo-message:portal-correlation:reconcile',
  }, fixture.context);
  assert.equal(sent.message.status, 'pending_confirmation');
  const reconciled = await reconcileCeoMessage(fixture.db, fixture.user, RAW_SESSION, sent.message.id, fixture.context);
  assert.equal(reconciled.message.status, 'delivered');
  assert.equal(fixture.state.messages[0].targetReceiptId, 'message-receipt-1');
  assert.equal(postCount, 1);
});

test('CEO-6 routes, policy, schema and UI preserve local ERP/Realm adapters', () => {
  const portal = fs.readFileSync(path.join(root, 'lib/ceo-messaging-admin.js'), 'utf8');
  const target = fs.readFileSync(path.join(root, 'lib/ceo-messaging-target-admin.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'app/(app)/ceo-inbox/page.jsx'), 'utf8');
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const docs = fs.readFileSync(path.join(root, 'docs/realms/CEO-PORTAL-FOUR-ENTITY-PLAN.md'), 'utf8');
  assert.match(portal, /encryptCeoMessage/);
  assert.match(target, /tx\.conversation\.create/);
  assert.match(target, /tx\.message\.create/);
  assert.match(target, /tx\.realmChangeEvent\.createMany/);
  assert.match(page, /CEO-6 · UNIFIED INBOX/);
  assert.match(schema, /model CeoEntityDirectoryProfile/);
  assert.match(schema, /model CeoUnifiedMessage/);
  assert.match(docs, /CEO-6 — Unified inbox and messaging/);
});

test('receipt sanitizer requires RepositoryRealms invariant evidence', () => {
  const message = normalizeCeoMessageEnvelope(envelope());
  assert.throws(() => sanitizeCeoMessageReceipt({ ...receiptFor(message), repository: { name: 'Unknown' } }, message), (error) => error.code === 'ceo_messaging_repository_evidence_missing');
});
