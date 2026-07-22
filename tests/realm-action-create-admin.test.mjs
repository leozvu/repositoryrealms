import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRealmRecordAction } from '../lib/realm-action-admin.js';

const USER = { id: 'staff-1', name: 'Mai Anh', roles: ['STAFF'], teamId: 'delivery' };
const AM = { id: 'am-1', name: 'Quang Võ', roles: ['AM'] };

function createDb(overrides = {}) {
  const calls = { comment: null, activity: null, receipt: null, audit: null, transactions: 0, taskReads: 0, leadReads: 0 };
  const task = overrides.task === null ? null : overrides.task || {
    id: 'task-1', title: 'Realm bridge', assigneeId: 'staff-1', assignee: { id: 'staff-1', teamId: 'delivery' },
  };
  const lead = overrides.lead === null ? null : overrides.lead || { id: 'lead-1', ownerId: 'am-1', stage: 'new' };
  const tx = {
    taskComment: { create: async ({ data }) => { calls.comment = data; return { id: 'comment-1', createdAt: new Date(), ...data }; } },
    activity: { create: async ({ data }) => { calls.activity = data; return { id: 'activity-1', ...data }; } },
    realmActionReceipt: { create: async ({ data }) => { calls.receipt = data; return { id: 'receipt-1', ...data }; } },
    auditLog: { create: async ({ data }) => { calls.audit = data; return data; } },
  };
  const db = {
    realmActionReceipt: { findUnique: async () => overrides.receipt || null },
    task: { findUnique: async () => { calls.taskReads += 1; return task; } },
    lead: { findUnique: async () => { calls.leadReads += 1; return lead; } },
    $transaction: async (fn) => { calls.transactions += 1; return fn(tx); },
  };
  return { db, calls };
}

test('War Council note tạo TaskComment ERP, receipt hash và audit không chứa nội dung', async () => {
  const { db, calls } = createDb();
  const result = await executeRealmRecordAction(db, USER, {
    action: 'task.comment.create', entityId: 'task-1', content: '  Blocker đã được gỡ. @Lan kiểm tra giúp.  ',
    idempotencyKey: 'realm-action:comment:create-1',
  });
  assert.equal(result.resource, 'taskcomments');
  assert.equal(result.event, 'create');
  assert.deepEqual(calls.comment, { taskId: 'task-1', userId: 'staff-1', content: 'Blocker đã được gỡ. @Lan kiểm tra giúp.' });
  assert.equal(calls.receipt.resultId, 'comment-1');
  assert.match(calls.receipt.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(calls.audit.refId, 'task-1');
  assert.doesNotMatch(calls.audit.detail, /Blocker|@Lan/);
  assert.equal(result.action.resultId, 'comment-1');
  assert.equal(Object.hasOwn(result.action, 'content'), false);
});

test('War Council note chặn rỗng, quá dài và Task ngoài Guild trước khi ghi', async () => {
  for (const [content, code] of [['   ', 'realm_task_comment_empty'], ['x'.repeat(801), 'realm_task_comment_too_long']]) {
    const { db, calls } = createDb();
    await assert.rejects(executeRealmRecordAction(db, USER, {
      action: 'task.comment.create', entityId: 'task-1', content, idempotencyKey: `realm-action:comment:${code}`,
    }), (error) => error.status === 400 && error.code === code);
    assert.equal(calls.transactions, 0);
  }
  const outside = createDb({ task: { id: 'task-2', assigneeId: 'staff-2', assignee: { id: 'staff-2', teamId: 'other' } } });
  await assert.rejects(executeRealmRecordAction(outside.db, USER, {
    action: 'task.comment.create', entityId: 'task-2', content: 'Không được phép', idempotencyKey: 'realm-action:comment:outside',
  }), (error) => error.status === 404 && error.code === 'realm_task_not_found');
  assert.equal(outside.calls.comment, null);
});

test('Diplomatic follow-up tạo Activity CRM đúng lead portfolio và không lộ title trong action metadata', async () => {
  const { db, calls } = createDb();
  const result = await executeRealmRecordAction(db, AM, {
    action: 'lead.followup.create', entityId: 'lead-1', kind: 'meeting', title: '  Chốt phạm vi proposal  ', date: '2026-07-21',
    idempotencyKey: 'realm-action:followup:create-1',
  });
  assert.equal(result.resource, 'activities');
  assert.equal(result.event, 'create');
  assert.deepEqual(calls.activity, {
    kind: 'meeting', refType: 'lead', refId: 'lead-1', title: 'Chốt phạm vi proposal', date: '2026-07-21', done: false, userId: 'am-1',
  });
  assert.equal(calls.receipt.resultId, 'activity-1');
  assert.equal(calls.audit.entity, 'activities');
  assert.doesNotMatch(calls.audit.detail, /proposal/);
  assert.equal(Object.hasOwn(result.action, 'title'), false);
});

test('Diplomatic follow-up chặn kind/date/title lỗi và Lead của AM khác', async () => {
  const invalidCases = [
    [{ kind: 'visit', title: 'A', date: '2026-07-21' }, 'realm_followup_kind_invalid'],
    [{ kind: 'call', title: '', date: '2026-07-21' }, 'realm_followup_title_empty'],
    [{ kind: 'call', title: 'A', date: '2026-02-30' }, 'realm_followup_date_invalid'],
  ];
  for (const [fields, code] of invalidCases) {
    const { db, calls } = createDb();
    await assert.rejects(executeRealmRecordAction(db, AM, {
      action: 'lead.followup.create', entityId: 'lead-1', ...fields, idempotencyKey: `realm-action:followup:${code}`,
    }), (error) => error.status === 400 && error.code === code);
    assert.equal(calls.transactions, 0);
  }
  const outside = createDb({ lead: { id: 'lead-2', ownerId: 'am-2', stage: 'new' } });
  await assert.rejects(executeRealmRecordAction(outside.db, AM, {
    action: 'lead.followup.create', entityId: 'lead-2', kind: 'email', title: 'Gửi recap', date: '2026-07-22',
    idempotencyKey: 'realm-action:followup:outside',
  }), (error) => error.status === 404 && error.code === 'realm_lead_not_found');
});

test('Create action replay dùng resultId, không đọc record; cùng key khác payload bị conflict', async () => {
  const first = createDb();
  await executeRealmRecordAction(first.db, USER, {
    action: 'task.comment.create', entityId: 'task-1', content: 'Một nội dung', idempotencyKey: 'realm-action:comment:replay',
  });
  const replay = createDb({ receipt: { id: 'receipt-1', ...first.calls.receipt } });
  const result = await executeRealmRecordAction(replay.db, USER, {
    action: 'task.comment.create', entityId: 'task-1', content: 'Một nội dung', idempotencyKey: 'realm-action:comment:replay',
  });
  assert.equal(result.idempotent, true);
  assert.equal(result.action.resultId, 'comment-1');
  assert.equal(replay.calls.taskReads, 0);
  assert.equal(replay.calls.transactions, 0);

  await assert.rejects(executeRealmRecordAction(replay.db, USER, {
    action: 'task.comment.create', entityId: 'task-1', content: 'Nội dung khác', idempotencyKey: 'realm-action:comment:replay',
  }), (error) => error.status === 409 && error.code === 'realm_action_idempotency_conflict');
});
