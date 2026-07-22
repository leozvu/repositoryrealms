import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTaskHandoff } from '../lib/approvals.js';

function approval() {
  return {
    id: 'approval-1',
    refId: 'task-1',
    title: 'Bàn giao Quest',
    requesterId: 'staff-1',
    requesterName: 'Mai',
    payload: JSON.stringify({ taskId: 'task-1', expectedAssigneeId: 'staff-1', targetAssigneeId: 'staff-2' }),
  };
}

function database({ targetTeam = 'team-1', changed = 1 } = {}) {
  const calls = { taskReads: 0, updates: [], audits: [] };
  const db = {
    task: {
      findUnique: async () => {
        calls.taskReads += 1;
        return calls.taskReads === 1
          ? { id: 'task-1', title: 'Quest', status: 'doing', assigneeId: 'staff-1', assignee: { teamId: 'team-1' } }
          : { id: 'task-1', title: 'Quest', status: 'doing', assigneeId: 'staff-2' };
      },
      updateMany: async (query) => { calls.updates.push(query); return { count: changed }; },
    },
    user: {
      findUnique: async () => ({ id: 'staff-2', teamId: targetTeam, status: 'active', userType: 'employee' }),
    },
    auditLog: {
      create: async (query) => { calls.audits.push(query); return query.data; },
    },
  };
  return { db, calls };
}

test('task handoff cập nhật Task ERP bằng CAS và audit trong cùng transaction caller', async () => {
  const { db, calls } = database();
  const result = await executeTaskHandoff(db, approval(), { id: 'lead-1', name: 'Trưởng Guild' });
  assert.equal(result.before.assigneeId, 'staff-1');
  assert.equal(result.updatedTask.assigneeId, 'staff-2');
  assert.deepEqual(calls.updates[0].where, { id: 'task-1', assigneeId: 'staff-1', status: { not: 'done' } });
  assert.equal(calls.audits[0].data.action, 'approve-executed');
});

test('task handoff tái kiểm tra cùng Guild tại thời điểm duyệt', async () => {
  const { db, calls } = database({ targetTeam: 'team-2' });
  await assert.rejects(
    executeTaskHandoff(db, approval(), { id: 'lead-1', name: 'Trưởng Guild' }),
    (error) => error.code === 'task_handoff_target_outside_team' && error.status === 409,
  );
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.audits.length, 0);
});

test('task handoff thua race không ghi audit thành công', async () => {
  const { db, calls } = database({ changed: 0 });
  await assert.rejects(
    executeTaskHandoff(db, approval(), { id: 'lead-1', name: 'Trưởng Guild' }),
    (error) => error.code === 'task_handoff_stale' && error.status === 409,
  );
  assert.equal(calls.audits.length, 0);
});
