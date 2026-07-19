import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNotificationDraft,
  normalizeNotificationRoute,
  normalizeNotificationRow,
  notificationRecordRoute,
  notificationRouteMeta,
} from '../lib/notification-inbox.js';

test('Raven Inbox chỉ chấp nhận internal route và chặn protocol-relative/control path', () => {
  assert.equal(normalizeNotificationRoute('/tasks?focus=task-1&from=notification'), '/tasks?focus=task-1&from=notification');
  for (const unsafe of ['https://evil.example', '//evil.example/path', '/tasks\\evil', '/tasks%0ajavascript:alert(1)']) {
    assert.equal(normalizeNotificationRoute(unsafe), '/messages');
  }
});

test('deep-link record chỉ sinh cho resource và ID allowlist', () => {
  assert.equal(notificationRecordRoute('tasks', 'task:1'), '/tasks?focus=task%3A1&from=notification');
  assert.equal(notificationRecordRoute('leads', 'lead-1'), '/leads?focus=lead-1&from=notification');
  assert.equal(notificationRecordRoute('tasks', '../outside'), '/tasks');
  assert.equal(notificationRecordRoute('unknown', 'id'), '/messages');
});

test('notification serializer gắn metadata giao diện nhưng không giữ field ngoài contract', () => {
  const row = normalizeNotificationRow({
    id: 'notice-1', userId: 'must-not-leak', text: '  War\nCouncil cập nhật  ', route: '/tasks?focus=task-1',
    readAt: null, createdAt: '2026-07-18T10:00:00.000Z', secret: 'hidden',
  });
  assert.deepEqual(row, {
    id: 'notice-1', text: 'War Council cập nhật', route: '/tasks?focus=task-1',
    kind: 'quest', kindLabel: 'War Council', targetLabel: 'Task ERP', icon: 'tasks',
    readAt: null, createdAt: '2026-07-18T10:00:00.000Z',
  });
  assert.equal(notificationRouteMeta('/approvals?focus=approval-1').kind, 'approval');
  assert.equal(normalizeNotificationDraft('', '/leads').text, 'Bạn có một cập nhật mới trong ERP · CRM.');
});
