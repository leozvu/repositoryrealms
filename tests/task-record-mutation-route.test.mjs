import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { resetRecords, state, prisma } from './helpers/stub-record-route-boundaries.mjs';
import { executeExecutionAction } from '../lib/execution-engine-admin.js';

register('./helpers/record-route-loader.mjs', import.meta.url);
const routes = [
  { name: 'session', item: await import('../app/api/data/[resource]/[id]/route.js') },
  { name: 'API key', item: await import('../app/api/v1/[resource]/[id]/route.js') },
];
const PM = { id: 'pm', name: 'Manager', roles: ['PM'], userType: 'employee' };
const TASK = {
  id: 'task', title: 'Original task', assigneeId: 'staff', status: 'blocked', workVersion: 7,
  blockReason: 'Await dependency', blockedAt: new Date('2026-09-01T08:00:00Z'), waitingReason: null,
  completedAt: null, dependsOn: '[]', escalationLevel: 0, mergedIntoTaskId: null,
};
const request = data => ({ json: async () => structuredClone(data) });
const context = () => ({ params: Promise.resolve({ resource: 'tasks', id: TASK.id }) });
const reset = (task = TASK) => resetRecords(PM, { task: { [TASK.id]: task } });
const writes = model => state.calls.filter(call => call.model === model);

for (const route of routes) {
  test(`${route.name}: task edits invalidate a Realm snapshot exactly once and reject forged metadata`, async () => {
    reset();
    let intercepted;
    state.interceptor = async (resource, before, data, _user, options) => {
      assert.equal(resource, 'tasks');
      assert.equal(before.workVersion, 7);
      assert.equal(options.db, prisma);
      intercepted = structuredClone(data);
      return null;
    };
    const response = await route.item.PUT(request({
      title: 'Updated task', workVersion: 999, blockReason: 'forged', blockedAt: null,
      waitingReason: 'forged', completedAt: new Date('2000-01-01'),
    }), context());
    assert.equal(response.status, 200);
    assert.equal(response.body.workVersion, 8);
    assert.equal(response.body.title, 'Updated task');
    for (const field of ['blockReason', 'blockedAt', 'waitingReason', 'completedAt']) assert.deepEqual(response.body[field], TASK[field]);
    assert.deepEqual(intercepted, { title: 'Updated task', workVersion: { increment: 1 } });
    assert.equal(writes('task').length, 1);
    assert.deepEqual(writes('task')[0].data.workVersion, { increment: 1 });
    assert.equal(writes('auditLog').length, 1);
    assert.equal(writes('eventOutbox').length, 1);
    await assert.rejects(executeExecutionAction(prisma, PM, {
      action: 'task.unblock', entityId: TASK.id, expectedVersion: 7, nextStatus: 'doing',
      idempotencyKey: 'bookkeeping:stale-snapshot:12345678',
    }), error => error.status === 409 && error.code === 'execution_work_stale');
    assert.equal(state.records.task.task.workVersion, 8);
    assert.equal(writes('task').length, 1);
  });

  test(`${route.name}: status changes clear obsolete execution metadata before interception`, async () => {
    for (const status of ['doing', 'blocked', 'waiting', 'done']) {
      const before = { ...TASK, waitingReason: 'Await response', completedAt: new Date('2026-08-01T09:00:00Z') };
      reset(before);
      let intercepted;
      state.interceptor = async (_resource, _before, data) => { intercepted = structuredClone(data); return null; };
      const started = Date.now();
      const response = await route.item.PUT(request({ status }), context());
      assert.equal(response.status, 200, status);
      const updated = response.body;
      assert.equal(updated.workVersion, 8, status);
      assert.equal(updated.blockReason, status === 'blocked' ? before.blockReason : null, status);
      assert.deepEqual(updated.blockedAt, status === 'blocked' ? before.blockedAt : null, status);
      assert.equal(updated.waitingReason, status === 'waiting' ? before.waitingReason : null, status);
      if (status === 'done') {
        assert.ok(updated.completedAt instanceof Date);
        assert.ok(+updated.completedAt >= started && +updated.completedAt <= Date.now());
      } else assert.equal(updated.completedAt, null, status);
      assert.deepEqual(intercepted, writes('task')[0].data);
      assert.equal(writes('task').length, 1);
    }
  });

  test(`${route.name}: intercepted task writes leave the version and metadata unchanged`, async () => {
    reset();
    let intercepted;
    state.interceptor = async (_resource, _before, data) => {
      intercepted = structuredClone(data);
      return { block: 'Approval required' };
    };
    const response = await route.item.PUT(request({ status: 'doing' }), context());
    assert.equal(response.status, 200);
    assert.equal(response.body._blocked, true);
    assert.deepEqual(intercepted.workVersion, { increment: 1 });
    assert.equal(intercepted.blockReason, null);
    assert.deepEqual(state.records.task.task, TASK);
    assert.equal(state.calls.length, 0);
  });

  test(`${route.name}: audit or outbox failure rolls back the task version and status metadata`, async () => {
    for (const failedModel of ['auditLog', 'eventOutbox']) {
      reset();
      state.failModel = failedModel;
      const response = await route.item.PUT(request({ status: 'doing', title: 'Must roll back' }), context());
      assert.equal(response.status, 400, failedModel);
      assert.deepEqual(state.records.task.task, TASK, failedModel);
      assert.equal(state.calls.length, 0, failedModel);
      state.failModel = null;
      const retry = await route.item.PUT(request({ status: 'doing', title: 'Saved after retry' }), context());
      assert.equal(retry.status, 200);
      assert.equal(retry.body.workVersion, 8);
      assert.equal(retry.body.blockReason, null);
      assert.equal(retry.body.blockedAt, null);
      assert.equal(writes('task').length, 1);
      assert.equal(writes('auditLog').length, 1);
      assert.equal(writes('eventOutbox').length, 1);
    }
  });
}
