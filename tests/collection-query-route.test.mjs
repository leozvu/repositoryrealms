import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { state } from './helpers/stub-collection-query-route.mjs';
import { createCollectionDb } from './helpers/collection-query-db.mjs';

register('./helpers/collection-query-route-loader.mjs', import.meta.url);
const routes = [
  { name: 'session', GET: (await import('../app/api/data/[resource]/route.js')).GET },
  { name: 'API key', GET: (await import('../app/api/v1/[resource]/route.js')).GET },
];
const staff = { id: 'staff-a', roles: ['STAFF'] };
const request = query => new Request('http://localhost/api/data/tasks?' + new URLSearchParams(query));
const context = resource => ({ params: Promise.resolve({ resource }) });

for (const { name, GET } of routes) {
  test(`${name}: collection GET applies filters and bounded pagination before serialization`, async () => {
    const memory = createCollectionDb({ timeLog: [
      { id: 'a', taskId: 'task-a', userId: staff.id, date: '2026-09-09' },
      { id: 'b', taskId: 'task-a', userId: staff.id, date: '2026-09-09' },
      { id: 'c', taskId: 'task-a', userId: 'other', date: '2026-09-09' },
      { id: 'd', taskId: 'task-b', userId: staff.id, date: '2026-09-09' },
    ] });
    Object.assign(state, { db: memory.db, user: staff, enabled: true });
    const first = await GET(request({ taskId: 'task-a', pageSize: '1' }), context('timelogs'));
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.map(row => row.id), ['a']);
    assert.equal(first.headers['Cache-Control'], 'private, no-store');
    assert.equal(first.headers['X-Collection-Has-More'], 'true');
    const second = await GET(request({ taskId: 'task-a', pageSize: '1', cursor: first.headers['X-Collection-Next-Cursor'] }), context('timelogs'));
    assert.deepEqual(second.body.map(row => row.id), ['b']);
    assert.equal(second.headers['X-Collection-Has-More'], 'false');
    assert.ok(memory.calls.filter(call => call.operation === 'findMany').every(call => call.take === 2));
    const limited = await GET(request({ taskId: 'task-a', limit: '1' }), context('timelogs'));
    assert.equal(limited.body.length, 1);
    assert.equal(memory.calls.at(-1).take, 1);
  });

  test(`${name}: malformed collection requests return structured 400 without querying records`, async () => {
    const memory = createCollectionDb();
    Object.assign(state, { db: memory.db, user: staff, enabled: true });
    const response = await GET(request({ limit: '-200' }), context('tasks'));
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'collection_limit_invalid');
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(memory.calls.length, 0);
  });

  test(`${name}: authentication, role and module gates still stop every collection read`, async () => {
    const memory = createCollectionDb();
    Object.assign(state, { db: memory.db, user: null, enabled: true });
    assert.equal((await GET(request({ pageSize: '10' }), context('tasks'))).status, 401);
    state.user = staff;
    assert.equal((await GET(request({ pageSize: '10' }), context('transactions'))).status, 403);
    state.enabled = false;
    assert.equal((await GET(request({ pageSize: '10' }), context('tasks'))).status, 403);
    assert.equal(memory.calls.length, 0);
  });
}
