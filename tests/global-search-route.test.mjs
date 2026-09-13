import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { state } from './helpers/stub-global-search-route.mjs';
import { createSearchDb } from './helpers/search-db.mjs';
register('./helpers/global-search-route-loader.mjs', import.meta.url);
const { GET } = await import('../app/api/search/route.js');
const request = params => new Request('http://localhost/api/search?' + new URLSearchParams(params));

test('search HTTP response is capped, explicitly paged and not cacheable across sessions', async () => {
  const memory = createSearchDb({ client: Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: 'Acme', phone: 'private' })) });
  Object.assign(state, { user: { id: 'am', roles: ['AM'] }, db: memory.db });
  const response = await GET(request({ q: 'acme', resource: 'clients' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.body.groups[0].items.length, 5);
  assert.equal(response.body.groups[0].hasMore, true);
  assert.ok(response.body.groups[0].nextCursor);
  assert.equal(JSON.stringify(response.body).includes('private'), false);
});

test('search route rejects auth/query errors before even loading settings', async () => {
  const memory = createSearchDb();
  Object.assign(state, { user: null, db: memory.db });
  assert.equal((await GET(request({ q: 'acme' }))).status, 401);
  state.user = { id: 'am', roles: ['AM'] };
  assert.equal((await GET(request({ q: 'x' }))).status, 400);
  assert.equal(memory.calls.length, 0);
});

test('route reads current module settings and applies them to Director searches', async () => {
  const memory = createSearchDb({ lead: [{ id: 'lead', name: 'Acme', ownerId: null }] }, []);
  Object.assign(state, { user: { id: 'director', roles: ['DIRECTOR'] }, db: memory.db });
  assert.equal((await GET(request({ q: 'acme', resource: 'leads' }))).status, 403);
  assert.deepEqual(memory.calls.map(call => call.model), ['setting']);
});
