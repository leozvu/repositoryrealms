import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readCollection } from '../lib/collection-query.js';
import { RESOURCES } from '../lib/registry.js';

const databaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;
test('PostgreSQL collection pages preserve nullable, date, boolean and numeric order with scoped anchors', { skip: !databaseUrl, timeout: 60000 }, async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(['postgresql:', 'postgres:'].includes(parsed.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /^\/codex_payment_test(?:_[a-zA-Z0-9_-]+)?$/);
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const run = `collection-test-${randomUUID()}`;
  const taskIds = ['a', 'b', 'c', 'd', 'e'].map(suffix => `${run}-task-${suffix}`);
  const contactIds = ['a', 'b', 'c'].map(suffix => `${run}-contact-${suffix}`);
  const phaseIds = ['a', 'b', 'c'].map(suffix => `${run}-phase-${suffix}`);
  const reviewIds = ['a', 'b', 'c', 'other'].map(suffix => `${run}-review-${suffix}`);
  const director = { id: `${run}-director`, roles: ['DIRECTOR'] };
  const staff = { id: run, roles: ['STAFF'] };
  const read = (resource, query, user = director) => readCollection(db, { resource, cfg: RESOURCES[resource], user, params: new URLSearchParams(query) });
  async function allPages(resource, filters, user = director) {
    const rows = [];
    let cursor = null;
    do {
      const result = await read(resource, { ...filters, pageSize: '1', ...(cursor ? { cursor } : {}) }, user);
      assert.ok(result.rows.length <= 1);
      rows.push(...result.rows);
      cursor = result.page.nextCursor;
      assert.ok(rows.length < 20, 'cursor must make forward progress');
    } while (cursor);
    return rows;
  }
  try {
    await db.$connect();
    await db.client.create({ data: { id: run, name: run } });
    await db.project.create({ data: { id: run, name: run, clientId: run } });
    await db.task.createMany({ data: taskIds.map((id, i) => ({ id, title: run, projectId: run, dueDate: i < 2 ? '2026-09-09' : i === 2 ? '2026-09-10' : null })) });
    await db.contact.createMany({ data: contactIds.map((id, i) => ({ id, clientId: run, name: run, primary: i < 2 })) });
    await db.phase.createMany({ data: phaseIds.map((id, i) => ({ id, projectId: run, name: run, order: i < 2 ? 0 : 2 })) });
    await db.review.createMany({ data: reviewIds.map((id, i) => ({ id, userId: i === 3 ? `${run}-other` : staff.id, quarter: `test-${run}-${i}`, createdAt: new Date(i < 2 ? '2026-09-09T00:00:00Z' : '2026-09-08T00:00:00Z') })) });

    assert.deepEqual((await allPages('tasks', { projectId: run })).map(row => row.id), taskIds);
    assert.deepEqual((await allPages('contacts', { clientId: run })).map(row => row.id), contactIds);
    assert.deepEqual((await allPages('phases', { projectId: run })).map(row => row.id), phaseIds);
    assert.deepEqual((await allPages('reviews', {}, staff)).map(row => row.id), reviewIds.slice(0, 3));
    const first = await read('reviews', { pageSize: '1' }, staff);
    await db.review.update({ where: { id: first.rows[0].id }, data: { userId: `${run}-other` } });
    await assert.rejects(read('reviews', { pageSize: '1', cursor: first.page.nextCursor }, staff), { code: 'collection_cursor_expired', status: 409 });

    // Every registry model/order is checked by Prisma against the real schema.
    // The fixture database is disposable; this does not load production settings.
    for (const resource of Object.keys(RESOURCES)) {
      const result = await read(resource, { pageSize: '1' });
      assert.ok(result.rows.length <= 1, resource);
    }
  } finally {
    await db.review.deleteMany({ where: { id: { in: reviewIds } } });
    await db.phase.deleteMany({ where: { id: { in: phaseIds } } });
    await db.contact.deleteMany({ where: { id: { in: contactIds } } });
    await db.task.deleteMany({ where: { id: { in: taskIds } } });
    await db.project.deleteMany({ where: { id: run } });
    await db.client.deleteMany({ where: { id: run } });
    await db.$disconnect();
  }
});
