import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CollaborationError,
  collaborationContactRoute,
  mergeCollaborationDirectory,
  normalizeCollaborationCapabilities,
  normalizeCollaborationSessionId,
  serializeCollaborationContact,
} from '../lib/collaboration.js';

test('presence hợp nhất nhiều tab theo userId và loại session quá hạn', () => {
  const now = new Date('2026-07-18T12:00:00.000Z');
  const people = mergeCollaborationDirectory({
    now,
    selfUserId: 'self-1',
    users: [
      { id: 'self-1', name: 'Tôi', title: 'PM' },
      { id: 'user-2', name: 'Mai Anh', title: 'HR' },
      { id: 'user-3', name: 'Nghĩa', title: 'Engineer' },
    ],
    sessions: [
      { userId: 'user-2', surface: 'erp', availability: 'available', capabilities: '["chat"]', lastSeen: '2026-07-18T11:59:50.000Z' },
      { userId: 'user-2', surface: 'realm', availability: 'focus', capabilities: '["chat","voice"]', lastSeen: '2026-07-18T11:59:55.000Z' },
      { userId: 'user-3', surface: 'erp', availability: 'available', capabilities: '["chat"]', lastSeen: '2026-07-18T11:50:00.000Z' },
    ],
  });
  assert.equal(people.length, 2);
  assert.deepEqual(people[0], {
    id: 'user-2', userId: 'user-2', name: 'Mai Anh', role: 'HR', online: true,
    availability: 'focus', surfaces: ['erp', 'realm'], capabilities: ['chat', 'voice'],
    lastSeen: '2026-07-18T11:59:55.000Z',
  });
  assert.equal(people[1].online, false);
  assert.equal(people[1].availability, 'away');
});

test('normalizer chặn session giả và chỉ giữ capability allowlist', () => {
  assert.throws(() => normalizeCollaborationSessionId('short'), CollaborationError);
  assert.equal(normalizeCollaborationSessionId('collab_1234567890'), 'collab_1234567890');
  assert.deepEqual(normalizeCollaborationCapabilities(['voice', 'admin', 'chat', 'voice']), ['voice', 'chat']);
});

test('contact serializer không lộ dữ liệu ngoài contract và sinh deep-link chat', () => {
  const row = {
    id: 'contact-1', requesterId: 'u1', requester: { name: 'Sơn' }, targetId: 'u2', target: { name: 'Mai' },
    kind: 'chat', status: 'pending', sourceSurface: 'realm', message: '  Cần review campaign  ',
    conversationId: 'conv-1', expiresAt: new Date('2026-07-18T12:05:00Z'), createdAt: new Date('2026-07-18T12:00:00Z'),
    secret: 'must-not-leak',
  };
  const contact = serializeCollaborationContact(row, 'u2');
  assert.equal(contact.direction, 'incoming');
  assert.equal(contact.route, '/messages?conversation=conv-1&contact=contact-1');
  assert.equal(contact.message, 'Cần review campaign');
  assert.equal(contact.secret, undefined);
  assert.equal(collaborationContactRoute('', 'contact-1'), '/messages');
});
