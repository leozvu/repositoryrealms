import assert from 'node:assert/strict';
import test from 'node:test';
import {
  heartbeatCollaborationPresence,
  loadCollaborationDirectory,
  requestCollaborationContact,
  respondCollaborationContact,
} from '../lib/collaboration-admin.js';

const now = new Date('2026-07-18T12:00:00.000Z');

test('heartbeat khóa session vào đúng user và không nhận userId từ client', async () => {
  let upsert;
  const db = {
    collaborationPresenceSession: {
      findUnique: async () => null,
      upsert: async (args) => { upsert = args; return args.create; },
    },
  };
  const result = await heartbeatCollaborationPresence(db, { id: 'user-1' }, {
    sessionId: 'collab_1234567890', userId: 'attacker', surface: 'realm', availability: 'focus', capabilities: ['voice', 'admin'],
  }, now);
  assert.equal(upsert.create.userId, 'user-1');
  assert.equal(upsert.update.userId, undefined);
  assert.equal(upsert.create.capabilities, '["voice"]');
  assert.equal(result.surface, 'realm');
});

test('heartbeat từ chối chiếm session của tài khoản khác', async () => {
  const db = { collaborationPresenceSession: { findUnique: async () => ({ userId: 'other' }) } };
  await assert.rejects(
    heartbeatCollaborationPresence(db, { id: 'user-1' }, { sessionId: 'collab_1234567890' }, now),
    (error) => error.status === 409 && error.code === 'presence_session_conflict',
  );
});

test('directory chỉ query nhân sự active và session còn hạn', async () => {
  const calls = {};
  const db = {
    user: { findMany: async (args) => { calls.users = args; return [{ id: 'user-2', name: 'Mai', title: 'HR' }]; } },
    collaborationPresenceSession: { findMany: async (args) => { calls.sessions = args; return [{ userId: 'user-2', surface: 'erp', availability: 'available', capabilities: '["chat"]', lastSeen: now }]; } },
  };
  const snapshot = await loadCollaborationDirectory(db, { id: 'user-1' }, now);
  assert.deepEqual(calls.users.where, { status: 'active', userType: 'employee' });
  assert.equal(calls.sessions.where.lastSeen.gte.toISOString(), '2026-07-18T11:58:50.000Z');
  assert.equal(snapshot.onlineUsers, 1);
});

function contactDb() {
  const calls = { messages: [], notifications: [], contacts: [], changes: [] };
  const tx = {
    convMember: {
      findMany: async () => [],
      createMany: async () => ({ count: 2 }),
    },
    conversation: {
      findFirst: async () => null,
      create: async () => ({ id: 'conv-1' }),
    },
    collaborationContactRequest: {
      create: async ({ data }) => {
        const row = { id: 'contact-1', ...data, createdAt: data.createdAt, updatedAt: data.createdAt };
        calls.contacts.push(row);
        return row;
      },
      update: async ({ data, include }) => ({
        id: 'contact-1', requesterId: 'user-1', requester: { name: 'Sơn' }, targetId: 'user-2', target: { name: 'Mai' },
        conversationId: 'conv-1', kind: 'chat', sourceSurface: 'realm', message: 'Review campaign', status: data.status,
        idempotencyKey: 'contact:1234567890', expiresAt: new Date('2026-07-18T12:05:00Z'), createdAt: now, ...data, include,
      }),
    },
    message: { create: async ({ data }) => { calls.messages.push(data); return data; } },
    notification: { create: async ({ data }) => { calls.notifications.push(data); return data; } },
  };
  const db = {
    user: { findFirst: async () => ({ id: 'user-2', name: 'Mai' }) },
    collaborationPresenceSession: { findMany: async () => [{ availability: 'available' }] },
    collaborationContactRequest: {
      findUnique: async () => null,
      findFirst: async () => null,
      count: async () => 0,
    },
    realmChangeEvent: {
      create: async ({ data }) => { calls.changes.push(data); return { id: `change-${calls.changes.length}`, ...data }; },
      deleteMany: async () => ({ count: 0 }),
    },
    $transaction: async (run) => run(tx),
  };
  return { db, tx, calls };
}

test('Realm contact tái sử dụng DM chuẩn, ghi Message và Notification trong một transaction', async () => {
  const { db, calls } = contactDb();
  const result = await requestCollaborationContact(db, { id: 'user-1', name: 'Sơn' }, {
    targetUserId: 'user-2', kind: 'chat', sourceSurface: 'realm', message: 'Review campaign', idempotencyKey: 'contact:1234567890',
  }, now);
  assert.equal(result.duplicate, false);
  assert.equal(result.contact.route, '/messages?conversation=conv-1&contact=contact-1');
  assert.equal(calls.messages[0].content, '[Gõ cửa từ Realm] Review campaign');
  assert.equal(calls.notifications[0].userId, 'user-2');
  assert.match(calls.notifications[0].text, /Sơn muốn nhắn tin từ Realm/);
  assert.deepEqual(calls.changes.map((item) => item.audienceUserId), ['user-2']);
});

test('DND chặn lời mời trước khi tạo conversation', async () => {
  const { db } = contactDb();
  db.collaborationPresenceSession.findMany = async () => [{ availability: 'dnd' }];
  await assert.rejects(
    requestCollaborationContact(db, { id: 'user-1', name: 'Sơn' }, {
      targetUserId: 'user-2', idempotencyKey: 'contact:1234567890',
    }, now),
    (error) => error.status === 409 && error.code === 'target_dnd',
  );
});

test('chỉ target được accept và phản hồi sinh notification cho requester', async () => {
  const { db, tx, calls } = contactDb();
  db.collaborationContactRequest.findFirst = async ({ where }) => where.targetId === 'user-2' ? {
    id: 'contact-1', requesterId: 'user-1', requester: { name: 'Sơn' }, targetId: 'user-2', target: { name: 'Mai' },
    conversationId: 'conv-1', kind: 'chat', sourceSurface: 'realm', message: 'Review campaign', status: 'pending',
    idempotencyKey: 'contact:1234567890', expiresAt: new Date('2026-07-18T12:05:00Z'), createdAt: now, seenAt: null,
  } : null;
  const result = await respondCollaborationContact(db, { id: 'user-2', name: 'Mai' }, { id: 'contact-1', action: 'accept' }, now);
  assert.equal(result.contact.status, 'accepted');
  assert.equal(calls.notifications.at(-1).userId, 'user-1');
  assert.equal(calls.notifications.at(-1).route, '/messages?conversation=conv-1&contact=contact-1');
  assert.equal(tx.collaborationContactRequest.update != null, true);
  assert.deepEqual(calls.changes.map((item) => item.audienceUserId).sort(), ['user-1', 'user-2']);
});
