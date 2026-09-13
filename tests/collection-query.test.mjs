import test from 'node:test';
import assert from 'node:assert/strict';
import { readCollection, collectionHeaders } from '../lib/collection-query.js';
import { RESOURCES } from '../lib/registry.js';
import { createCollectionDb } from './helpers/collection-query-db.mjs';

const staff = { id: 'staff-a', roles: ['STAFF'] };
const director = { id: 'director', roles: ['DIRECTOR'] };
const read = (memory, resource, query = {}, user = staff) => readCollection(memory.db, { resource, cfg: RESOURCES[resource], user, params: new URLSearchParams(query) });

test('client workspace filters related records in the database instead of fetching unrelated customers', async () => {
  for (const resource of ['contacts', 'quotes', 'invoices', 'projects', 'tickets', 'nps', 'csat']) {
    const cfg = RESOURCES[resource];
    const memory = createCollectionDb({ [cfg.model]: [{ id: 'mine', clientId: 'client-a' }, { id: 'unrelated', clientId: 'client-b' }] });
    assert.deepEqual((await read(memory, resource, { clientId: 'client-a' }, director)).rows.map(row => row.id), ['mine'], resource);
    assert.match(JSON.stringify(memory.calls[0].where), /client-a/, resource);
  }
  const clients = createCollectionDb({ client: [{ id: 'client-a', name: 'A' }, { id: 'client-b', name: 'B' }] });
  assert.deepEqual((await read(clients, 'clients', { id: 'client-a' }, director)).rows.map(row => row.id), ['client-a']);
  const activities = createCollectionDb({ activity: [{ id: 'client-touch', refType: 'client', refId: 'client-a' }, { id: 'other-type', refType: 'lead', refId: 'client-a' }] });
  assert.deepEqual((await read(activities, 'activities', { refType: 'client', refId: 'client-a' }, director)).rows.map(row => row.id), ['client-touch']);
});

test('legacy unpaged clients keep full array contents/order and field sanitization', async () => {
  const memory = createCollectionDb({ client: [{ id: 'b', name: 'Beta', phone: 'secret-b' }, { id: 'a', name: 'Alpha', phone: 'secret-a' }] });
  const result = await read(memory, 'clients');
  assert.deepEqual(result.rows.map(row => row.id), ['a', 'b']);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(result.page, null);
  assert.equal('take' in memory.calls[0], false);
  assert.deepEqual(memory.calls[0].orderBy, RESOURCES.clients.orderBy);
  assert.deepEqual(collectionHeaders(), { 'Cache-Control': 'private, no-store' });
});

test('allowlisted filters narrow the user scope at the database, including null relations', async () => {
  const memory = createCollectionDb({ timeLog: [
    { id: 'mine', userId: staff.id, taskId: 'task-a', invoiceId: null },
    { id: 'theirs', userId: 'staff-b', taskId: 'task-a', invoiceId: null },
    { id: 'invoiced', userId: staff.id, taskId: 'task-a', invoiceId: 'invoice' },
  ] });
  assert.deepEqual((await read(memory, 'timelogs', { taskId: 'task-a', invoiceId: '__null__', hours: '999' })).rows.map(row => row.id), ['mine']);
  assert.deepEqual(memory.calls[0].where, { AND: [{ userId: staff.id }, { taskId: 'task-a', invoiceId: null }] });
  assert.deepEqual((await read(memory, 'timelogs', { userId: 'staff-b' })).rows, []);
});

test('invalid limits and ambiguous pagination are rejected before any database read', async () => {
  const memory = createCollectionDb();
  for (const query of [
    { limit: '0' }, { limit: '-1' }, { limit: '1.5' }, { limit: 'no' }, { limit: 'Infinity' }, { limit: '' },
    { pageSize: '0' }, { pageSize: '-200' }, { pageSize: '9007199254740992' },
    { limit: '2', pageSize: '2' }, { cursor: 'anything' },
    'limit=1&limit=2', 'pageSize=1&pageSize=2', 'taskId=a&taskId=b',
  ]) {
    await assert.rejects(read(memory, 'timelogs', query), error => error.status === 400);
  }
  assert.equal(memory.calls.length, 0);
  await read(memory, 'tasks', { limit: '99999' });
  assert.equal(memory.calls[0].take, 2000);
});

test('bounded cursor pages retain resource ordering across ties and null values', async () => {
  const memory = createCollectionDb({ task: [
    { id: 'z', dueDate: null }, { id: 'b', dueDate: '2026-09-09' },
    { id: 'a', dueDate: '2026-09-09' }, { id: 'c', dueDate: '2026-09-10' }, { id: 'y', dueDate: null },
  ] });
  const first = await read(memory, 'tasks', { pageSize: '2' });
  const second = await read(memory, 'tasks', { pageSize: '2', cursor: first.page.nextCursor });
  const third = await read(memory, 'tasks', { pageSize: '2', cursor: second.page.nextCursor });
  assert.deepEqual([...first.rows, ...second.rows, ...third.rows].map(row => row.id), ['a', 'b', 'c', 'y', 'z']);
  assert.deepEqual(third.page, { size: 2, hasMore: false, nextCursor: null });
  assert.ok(memory.calls.filter(call => call.operation === 'findMany').every(call => call.take === 3));
  assert.deepEqual(memory.calls[0].orderBy, [{ dueDate: 'asc' }, { id: 'asc' }]);
  assert.equal(collectionHeaders(first.page)['X-Collection-Has-More'], 'true');
  assert.equal(collectionHeaders(third.page)['X-Collection-Has-More'], 'false');
  assert.equal('X-Collection-Next-Cursor' in collectionHeaders(third.page), false);
});

test('page caps are applied in the database and no total-count/full-table fetch is needed', async () => {
  const memory = createCollectionDb();
  const result = await read(memory, 'tasks', { pageSize: '9999' });
  assert.equal(result.page.size, 200);
  assert.equal(memory.calls.length, 1);
  assert.equal(memory.calls[0].take, 201);
});

test('a cursor cannot be reused with another user, role, resource, filter or page size', async () => {
  const memory = createCollectionDb({ task: [{ id: 'a', dueDate: null, status: 'todo' }, { id: 'b', dueDate: null, status: 'todo' }] });
  const { page } = await read(memory, 'tasks', { pageSize: '1', status: 'todo' });
  for (const [resource, query, user] of [
    ['tasks', { pageSize: '1', status: 'done' }, staff],
    ['tasks', { pageSize: '2', status: 'todo' }, staff],
    ['tasks', { pageSize: '1', status: 'todo' }, { ...staff, id: 'staff-b' }],
    ['tasks', { pageSize: '1', status: 'todo' }, { ...staff, roles: ['PM'] }],
    ['projects', { pageSize: '1', status: 'todo' }, staff],
  ]) {
    await assert.rejects(read(memory, resource, { ...query, cursor: page.nextCursor }, user), { code: 'collection_cursor_invalid' });
  }
  assert.equal(memory.calls.length, 1, 'invalid cursors must not fetch an anchor or a page');
});

test('malformed cursors fail clearly, and deleting or moving the anchor out of scope requires a refresh', async () => {
  const memory = createCollectionDb({ lead: [{ id: 'a', ownerId: null }, { id: 'b', ownerId: null }] });
  const am = { id: 'am', roles: ['AM'] };
  const { page } = await read(memory, 'leads', { pageSize: '1' }, am);
  for (const cursor of ['', '!', 'e30', 'a'.repeat(2049)]) {
    await assert.rejects(read(memory, 'leads', { pageSize: '1', cursor }, am), { code: 'collection_cursor_invalid' });
  }
  memory.data.lead[0].ownerId = 'someone-else';
  await assert.rejects(read(memory, 'leads', { pageSize: '1', cursor: page.nextCursor }, am), { code: 'collection_cursor_expired', status: 409 });
  assert.equal(memory.calls.filter(call => call.operation === 'findMany').length, 1);
  assert.deepEqual(memory.calls.at(-1).where, { AND: [{ OR: [{ ownerId: am.id }, { ownerId: null }] }, { id: 'a' }] });
  memory.data.lead = [];
  await assert.rejects(read(memory, 'leads', { pageSize: '1', cursor: page.nextCursor }, am), { code: 'collection_cursor_expired' });
});

test('pagination never exposes hidden user fields in the body or cursor', async () => {
  const memory = createCollectionDb({ user: ['a', 'b'].map(id => ({ id, name: id, salary: 100, passwordHash: 'password-secret', totpSecret: 'totp-secret', avatar: 'avatar-secret' })) });
  const result = await read(memory, 'users', { pageSize: '1' });
  assert.deepEqual(result.rows, [{ id: 'a', name: 'a', hasAvatar: true, has2fa: true }]);
  const cursor = JSON.parse(Buffer.from(result.page.nextCursor, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(cursor).sort(), ['binding', 'id', 'v']);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.ok((await read(memory, 'users', {}, director)).rows.every(row => row.salary === 100));
});
