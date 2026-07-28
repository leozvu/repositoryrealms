import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRealmFeedback,
  isRealmFeedbackManager,
  loadRealmFeedbackOverview,
  normalizeRealmFeedbackDraft,
  serializeRealmFeedback,
  updateRealmFeedback,
} from '../lib/realm-feedback.js';

const DIRECTOR = { id: 'director-1', name: 'Director', role: 'DIRECTOR', roles: ['DIRECTOR'], userType: 'employee' };
const STAFF = { id: 'staff-1', name: 'Staff', role: 'STAFF', roles: ['STAFF'], userType: 'employee' };
const NOW = new Date('2026-07-19T13:30:00.000Z');

function feedbackRow(overrides = {}) {
  return {
    id: 'ticket-1',
    code: 'RPF-20260719-ABCDEF12',
    title: '[Realm Pilot][Khó sử dụng] Không thấy Quest Board',
    desc: 'Tôi mở Great Hall nhưng chưa tìm thấy nút Quest Board.',
    priority: 'normal',
    status: 'open',
    assigneeId: null,
    reporterId: STAFF.id,
    source: 'realm_pilot',
    feedbackType: 'friction',
    feedbackSurface: 'realm',
    feedbackContext: JSON.stringify({ schemaVersion: 1, surface: 'realm', route: '/realm', area: 'Great Hall', impact: 'degraded', release: 'abc123', privacy: 'no-record-content' }),
    feedbackResponse: null,
    requestKey: 'realm-feedback:1234567890',
    createdAt: NOW,
    updatedAt: NOW,
    resolvedAt: null,
    ...overrides,
  };
}

test('feedback draft validates allowlists and strips query strings from disclosed context', () => {
  const draft = normalizeRealmFeedbackDraft({
    category: 'bug', impact: 'blocked', surface: 'realm',
    summary: '  Không mở được Tavern  ',
    details: 'Tôi bấm mở Tavern nhưng màn hình không đổi.',
    route: '/realm?token=must-not-survive', area: ' Tavern ',
  }, { release: ' ef0376a ' });
  assert.equal(draft.summary, 'Không mở được Tavern');
  assert.equal(draft.context.route, '/realm');
  assert.equal(draft.context.area, 'Tavern');
  assert.equal(draft.context.privacy, 'no-record-content');
  assert.equal(JSON.stringify(draft).includes('token'), false);
  assert.throws(() => normalizeRealmFeedbackDraft({ ...draft, category: 'root' }), /chọn loại phản hồi/i);
  assert.throws(() => normalizeRealmFeedbackDraft({ ...draft, surface: 'admin' }), /không hợp lệ/i);
});

test('feedback creation is serializable, idempotent and appends Ticket plus AuditLog once', async () => {
  const calls = { creates: [], audits: [], options: null };
  let stored = null;
  const tx = {
    ticket: {
      findUnique: async () => stored,
      create: async ({ data }) => {
        stored = feedbackRow({ ...data, id: 'ticket-created', updatedAt: data.createdAt });
        calls.creates.push(data);
        return stored;
      },
    },
    auditLog: { create: async (value) => { calls.audits.push(value); return value; } },
  };
  const db = { $transaction: async (operation, options) => { calls.options = options; return operation(tx); } };
  const payload = {
    category: 'friction', impact: 'degraded', surface: 'realm',
    summary: 'Không thấy Quest Board', details: 'Tôi mở Great Hall nhưng chưa tìm thấy nút Quest Board.',
    route: '/realm', area: 'Great Hall',
  };
  const first = await createRealmFeedback(db, STAFF, payload, 'realm-feedback:1234567890', { now: () => NOW, idFactory: () => 'abcdef12-0000-0000-0000-000000000000', release: 'abc123' });
  const retry = await createRealmFeedback(db, STAFF, payload, 'realm-feedback:1234567890', { now: () => NOW, idFactory: () => 'different-id' });
  assert.equal(first.code, 'RPF-20260719-ABCDEF12');
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.audits.length, 1);
  assert.deepEqual(calls.options, { isolationLevel: 'Serializable' });
  assert.equal(calls.creates[0].source, 'realm_pilot');
  assert.equal(calls.creates[0].dueAt.toISOString(), '2026-07-20T13:30:00.000Z');
});

test('feedback overview scopes staff to self and exposes aggregate privacy-safe metrics to managers', async () => {
  const rows = [
    feedbackRow(),
    feedbackRow({ id: 'ticket-2', reporterId: 'staff-2', feedbackType: 'bug', feedbackSurface: 'erp', status: 'resolved', feedbackContext: JSON.stringify({ impact: 'blocked', route: '/tasks', area: 'Task form', release: 'abc123' }) }),
  ];
  const staffDb = {
    ticket: { findMany: async (query) => { assert.equal(query.where.reporterId, STAFF.id); return [rows[0]]; } },
  };
  const own = await loadRealmFeedbackOverview(staffDb, STAFF);
  assert.equal(own.manager, false);
  assert.equal(own.rows.length, 1);
  assert.equal(own.rows[0].reporter, undefined);

  let userQuery = 0;
  const managerDb = {
    ticket: { findMany: async (query) => { assert.deepEqual(query.where, { source: 'realm_pilot' }); return rows; } },
    user: { findMany: async () => ++userQuery === 1
      ? [{ id: STAFF.id, name: 'Staff' }, { id: 'staff-2', name: 'Second Staff' }]
      : [DIRECTOR, STAFF] },
  };
  const all = await loadRealmFeedbackOverview(managerDb, DIRECTOR);
  assert.equal(all.manager, true);
  assert.equal(all.metrics.total, 2);
  assert.equal(all.metrics.unresolved, 1);
  assert.equal(all.metrics.blocked, 1);
  assert.deepEqual(all.metrics.bySurface, { realm: 1, erp: 1 });
  assert.deepEqual(all.handlers, [{ id: DIRECTOR.id, name: DIRECTOR.name }]);
  assert.equal(all.rows[1].reporter.name, 'Second Staff');
  assert.equal(all.privacy.performanceTracking, false);
  assert.equal(all.privacy.durationTracking, false);

  const managerOwnDb = {
    ticket: { findMany: async (query) => {
      assert.deepEqual(query.where, { source: 'realm_pilot', reporterId: DIRECTOR.id });
      return [];
    } },
  };
  const managerOwn = await loadRealmFeedbackOverview(managerOwnDb, DIRECTOR, { mine: true });
  assert.equal(managerOwn.manager, true);
  assert.equal(managerOwn.metrics.total, 0);
  assert.deepEqual(managerOwn.handlers, []);
});

test('feedback update enforces manager role and optimistic concurrency', async () => {
  assert.equal(isRealmFeedbackManager(DIRECTOR), true);
  assert.equal(isRealmFeedbackManager(STAFF), false);
  await assert.rejects(() => updateRealmFeedback({}, STAFF, 'ticket-1', {}), (error) => error.code === 'realm_feedback_manager_forbidden');

  let current = feedbackRow();
  const calls = { audits: [], options: null };
  const tx = {
    ticket: {
      findUnique: async () => current,
      update: async ({ data }) => {
        current = { ...current, ...data, updatedAt: new Date('2026-07-19T13:31:00.000Z') };
        return current;
      },
    },
    user: { findFirst: async () => ({ id: DIRECTOR.id }) },
    auditLog: { create: async (value) => { calls.audits.push(value); return value; } },
  };
  const db = { $transaction: async (operation, options) => { calls.options = options; return operation(tx); } };
  const updated = await updateRealmFeedback(db, DIRECTOR, current.id, {
    expectedUpdatedAt: NOW.toISOString(), status: 'in_progress', priority: 'high', assigneeId: DIRECTOR.id, response: 'Đã tái hiện và đang sửa.',
  });
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.response, 'Đã tái hiện và đang sửa.');
  assert.equal(calls.audits.length, 1);
  assert.deepEqual(calls.options, { isolationLevel: 'Serializable' });
  await assert.rejects(() => updateRealmFeedback(db, DIRECTOR, current.id, {
    expectedUpdatedAt: NOW.toISOString(), status: 'resolved', priority: 'normal',
  }), (error) => error.code === 'realm_feedback_stale');
});

test('serialized feedback omits idempotency keys and keeps only declared context', () => {
  const serialized = serializeRealmFeedback(feedbackRow({ feedbackContext: '{broken' }));
  assert.equal('requestKey' in serialized, false);
  assert.deepEqual(serialized.context, { area: '', route: '/dashboard', release: '' });
  assert.equal(serialized.summary, 'Không thấy Quest Board');
});
