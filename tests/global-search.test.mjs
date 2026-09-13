import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchRequest, searchRecords } from '../lib/global-search.js';
import { createSearchDb } from './helpers/search-db.mjs';
const AM = { id: 'am', roles: ['AM'] };
const STAFF = { id: 'staff', roles: ['STAFF'] };
const DIRECTOR = { id: 'director', roles: ['DIRECTOR'] };
const params = value => new URLSearchParams(value);
const code = value => error => error.code === value;

test('auth, resource and query validation precede persistence reads', async () => {
  const memory = createSearchDb();
  await assert.rejects(searchRecords(memory.db, null, params({ q: 'acme' })), code('unauthorized'));
  await assert.rejects(searchRecords(memory.db, { ...AM, userType: 'freelancer' }, params({ q: 'acme' })), code('forbidden'));
  for (const q of ['', 'x', 'a'.repeat(101)]) await assert.rejects(searchRecords(memory.db, AM, params({ q })), code('search_query_invalid'));
  await assert.rejects(searchRecords(memory.db, DIRECTOR, params({ q: 'acme', resource: 'auditLog' })), code('search_resource_invalid'));
  assert.equal(memory.calls.length, 0);
});

test('row ownership and module restrictions are composed with search, including Director module limits', async () => {
  const memory = createSearchDb({ lead: [
    { id: 'a', name: 'Acme own', ownerId: 'am' }, { id: 'b', name: 'Acme unassigned', ownerId: null }, { id: 'c', name: 'Acme other', ownerId: 'other' },
  ] });
  const result = await searchRecords(memory.db, AM, params({ q: 'acme', resource: 'leads' }), ['sales']);
  assert.deepEqual(result.groups[0].items.map(row => row.id), ['a', 'b']);
  await assert.rejects(searchRecords(memory.db, STAFF, params({ q: 'acme', resource: 'leads' })), code('forbidden'));
  await assert.rejects(searchRecords(memory.db, DIRECTOR, params({ q: 'acme', resource: 'leads' }), []), code('forbidden'));
  const global = await searchRecords(memory.db, DIRECTOR, params({ q: 'acme' }), []);
  for (const resource of ['leads', 'projects', 'tasks', 'tickets', 'vendors']) assert.ok(!global.groups.some(group => group.resource === resource));
});

test('private client contact values cannot be inferred from search matches or returned payload', async () => {
  const memory = createSearchDb({ client: [{ id: 'client', name: 'Acme', contact: 'Secretperson', phone: '0901234567', industry: 'Agency', note: 'private notes' }], user: [{ id: 'person', name: 'Acme employee', title: 'Designer', email: 'searchme@example.test', salary: 99_000_000, passwordHash: 'secret', avatar: 'huge-data' }] });
  const hidden = await searchRecords(memory.db, STAFF, params({ q: 'secretperson', resource: 'clients' }));
  assert.equal(hidden.groups[0].items.length, 0);
  const allowed = await searchRecords(memory.db, AM, params({ q: 'secretperson', resource: 'clients' }));
  assert.deepEqual(allowed.groups[0].items, [{ id: 'client', name: 'Acme', industry: 'Agency' }]);
  const users = await searchRecords(memory.db, STAFF, params({ q: 'searchme', resource: 'users' }));
  assert.deepEqual(users.groups[0].items, [{ id: 'person', name: 'Acme employee', title: 'Designer' }]);
  assert.ok(!memory.calls.some(call => call.select?.passwordHash || call.select?.salary || call.select?.avatar || call.select?.note));
});

test('cursor pages are deterministic, capped and reapply scopes; cursors cannot cross query/resource/user', async () => {
  const memory = createSearchDb({ client: Array.from({ length: 25 }, (_, i) => ({ id: String(i).padStart(3, '0'), name: 'Acme ' + i, industry: 'Agency' })) });
  const first = await searchRecords(memory.db, AM, params({ q: 'Acme', resource: 'clients', limit: '999' }));
  assert.equal(first.limit, 20);
  assert.equal(first.groups[0].items.length, 20);
  assert.equal(first.capped, true);
  assert.equal(memory.calls[0].take, 21);
  assert.deepEqual(memory.calls[0].orderBy, { id: 'asc' });
  const cursor = first.groups[0].nextCursor;
  const second = await searchRecords(memory.db, AM, params({ q: 'Acme', resource: 'clients', cursor }));
  assert.equal(second.groups[0].items.length, 5);
  assert.equal(second.groups[0].hasMore, false);
  assert.equal(second.groups[0].nextCursor, null);
  assert.equal(new Set([...first.groups[0].items, ...second.groups[0].items].map(row => row.id)).size, 25);
  for (const input of [{ q: 'other', resource: 'clients', cursor }, { q: 'acme', resource: 'tasks', cursor }, { q: 'acme', cursor }, { q: 'acme', resource: 'clients', cursor: 'garbage' }]) {
    await assert.rejects(searchRecords(memory.db, AM, params(input)), code('search_cursor_invalid'));
  }
  await assert.rejects(searchRecords(memory.db, DIRECTOR, params({ q: 'acme', resource: 'clients', cursor })), code('search_cursor_invalid'));
  assert.throws(() => parseSearchRequest(params({ q: 'acme', limit: '-1' }), AM), code('search_limit_invalid'));
});

test('search terms match across permitted fields and SQL wildcard characters remain literal', async () => {
  const memory = createSearchDb({ client: [{ id: 'a', name: 'Acme', industry: 'Agency' }, { id: 'b', name: 'Acme', industry: 'Retail' }, { id: 'c', name: 'Acme %_literal', industry: 'Agency' }] });
  const cross = await searchRecords(memory.db, STAFF, params({ q: '  Acme   Agency ', resource: 'clients' }));
  assert.deepEqual(cross.groups[0].items.map(row => row.id), ['a', 'c']);
  const literal = await searchRecords(memory.db, STAFF, params({ q: '%_', resource: 'clients' }));
  assert.deepEqual(literal.groups[0].items.map(row => row.id), ['c']);
  assert.equal(memory.calls.at(-1).where.AND[1].OR[0].name.contains, '\\%\\_');
});
