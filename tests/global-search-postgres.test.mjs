import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { searchRecords } from '../lib/global-search.js';

const databaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;
test('PostgreSQL search filters before paging, escapes LIKE patterns and keeps private matches hidden', { skip: !databaseUrl, timeout: 60000 }, async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(['postgresql:', 'postgres:'].includes(parsed.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /^\/codex_payment_test(?:_[a-zA-Z0-9_-]+)?$/);
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const run = `search-test-${randomUUID()}`;
  const ids = Array.from({ length: 23 }, (_, i) => `${run}-${String(i).padStart(2, '0')}`);
  const leadIds = [`${run}-own`, `${run}-other`];
  const am = { id: run, roles: ['AM'] }, staff = { id: `${run}-staff`, roles: ['STAFF'] };
  const params = value => new URLSearchParams(value);
  try {
    await db.$connect();
    await db.client.createMany({ data: ids.map((id, i) => ({ id, name: `${run} ${i === 0 ? '%_ literal' : 'ordinary'}`, phone: 'hidden-' + run, industry: 'Agency' })) });
    await db.lead.createMany({ data: [{ id: leadIds[0], name: run, ownerId: am.id }, { id: leadIds[1], name: run, ownerId: 'other' }] });
    const first = await searchRecords(db, am, params({ q: run, resource: 'clients' }));
    assert.equal(first.groups[0].items.length, 5);
    assert.equal(first.capped, true);
    const second = await searchRecords(db, am, params({ q: run, resource: 'clients', cursor: first.groups[0].nextCursor }));
    assert.equal(second.groups[0].items.length, 5);
    assert.equal(new Set([...first.groups[0].items, ...second.groups[0].items].map(row => row.id)).size, 10);
    const literal = await searchRecords(db, am, params({ q: `${run} %_`, resource: 'clients' }));
    assert.deepEqual(literal.groups[0].items.map(row => row.id), [ids[0]]);
    const hidden = await searchRecords(db, staff, params({ q: 'hidden-' + run, resource: 'clients' }));
    assert.equal(hidden.groups[0].items.length, 0);
    const owned = await searchRecords(db, am, params({ q: run, resource: 'leads' }), ['sales']);
    assert.deepEqual(owned.groups[0].items.map(row => row.id), [leadIds[0]]);
    // Exercise every descriptor against actual Prisma/schema, including groups
    // without fixtures. An invalid select/search field must fail this test.
    const global = await searchRecords(db, { id: `${run}-director`, roles: ['DIRECTOR'] }, params({ q: run }));
    assert.equal(global.groups.length, 9);
    assert.ok(global.groups.every(group => group.items.length <= 5));
    assert.equal(JSON.stringify(global).includes('phone'), false);
  } finally {
    await db.lead.deleteMany({ where: { id: { in: leadIds } } });
    await db.client.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
