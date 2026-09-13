import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readLeadBoard } from '../lib/lead-board.js';

const databaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;
test('PostgreSQL Lead board scopes real pages and aggregates and holds one repeatable snapshot across a concurrent insert', { skip: !databaseUrl, timeout: 60000 }, async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(['postgresql:', 'postgres:'].includes(parsed.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /^\/codex_payment_test(?:_[a-zA-Z0-9_-]+)?$/);
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const run = `lead-board-test-${randomUUID()}`, user = { id: `${run}-am`, roles: ['AM'] };
  const otherOwner = `${run}-other`, now = new Date('2026-01-31T12:00:00Z');
  const rows = Array.from({ length: 38 }, (_, index) => ({
    id: `${run}-${String(index).padStart(3, '0')}`, name: run, ownerId: user.id,
    stage: index < 32 ? 'new' : index < 36 ? 'proposal' : 'won', value: (index + 1) * 1000,
    campaign: `${run}-campaign`, expectedClose: index < 3 ? null : index < 6 ? '' : index % 2 ? '2026-01-31' : '2026-02-28',
    createdAt: '2026-01-31T00:00:00Z',
  }));
  const foreign = Array.from({ length: 3 }, (_, index) => ({ ...rows[index], id: `${run}-foreign-${index}`, ownerId: otherOwner, value: 900000000 }));
  const lateId = `${run}-concurrent`, ids = [...rows, ...foreign].map(row => row.id).concat(lateId);
  const query = params => readLeadBoard(db, user, new URLSearchParams(params), now);
  try {
    await db.$connect();
    const before = await query();
    await db.lead.createMany({ data: [...rows, ...foreign] });
    const first = await query();
    assert.equal(first.summary.total, before.summary.total + 38);
    assert.equal(first.summary.openCount, before.summary.openCount + 36);
    assert.equal(first.summary.openValue, before.summary.openValue + rows.filter(row => row.stage !== 'won').reduce((sum, row) => sum + row.value, 0));
    assert.equal(first.summary.noDateCount, before.summary.noDateCount + 6);
    assert.equal(first.summary.stages.new.count, before.summary.stages.new.count + 32);
    assert.equal(first.summary.stages.new.value, before.summary.stages.new.value + rows.slice(0, 32).reduce((sum, row) => sum + row.value, 0));
    assert.equal(first.columns.new.rows.length, 25);
    assert.equal(first.columns.new.page.hasMore, true);
    assert.deepEqual(first.summary.months, ['2026-01', '2026-02', '2026-03']);
    // Existing setting 1 is read, never changed. Round once per whole month,
    // accounting for any fractional contribution from pre-existing test data.
    const authorized = await db.lead.findMany({ where: { OR: [{ ownerId: user.id }, { ownerId: null }] } });
    const open = authorized.filter(row => !['won', 'lost'].includes(row.stage));
    assert.deepEqual(first.summary.forecast, first.summary.months.map(month => Math.round(open
      .filter(row => row.expectedClose?.startsWith(month))
      .reduce((sum, row) => sum + row.value * (first.summary.probability[row.stage] || 0) / 100, 0))));
    const campaign = first.summary.campaigns.find(item => item.key === `${run}-campaign`);
    assert.ok(campaign, 'isolated fixture campaign is present in the top ten');
    assert.deepEqual(campaign, { key: `${run}-campaign`, total: 38, won: 2, wonValue: 75000, openValue: 666000 });
    assert.ok(Object.values(first.columns).every(column => column.rows.every(row => row.ownerId !== otherOwner)));

    const second = await query({ newCursor: first.columns.new.page.nextCursor });
    assert.deepEqual(second.summary, first.summary);
    assert.ok(second.columns.new.rows.length > 0);
    assert.ok(second.columns.new.rows.every(row => !first.columns.new.rows.some(previous => previous.id === row.id)));
    let collected = [...first.columns.new.rows, ...second.columns.new.rows], cursor = second.columns.new.page.nextCursor;
    while (cursor) {
      assert.ok(collected.length < 10000, 'cursor must make forward progress in isolated fixtures');
      const next = await query({ newCursor: cursor }); collected.push(...next.columns.new.rows); cursor = next.columns.new.page.nextCursor;
    }
    assert.deepEqual(collected.filter(row => row.id.startsWith(run)).map(row => row.id).sort(), rows.slice(0, 32).map(row => row.id));
    const payload = JSON.parse(Buffer.from(first.columns.new.page.nextCursor, 'base64url').toString('utf8'));
    const ownCursorRow = rows.find(row => row.id === payload.id);
    assert.ok(ownCursorRow, 'pagination anchor belongs to this isolated fixture');
    await db.lead.update({ where: { id: ownCursorRow.id }, data: { ownerId: otherOwner } });
    await assert.rejects(query({ newCursor: first.columns.new.page.nextCursor }), { code: 'collection_cursor_expired', status: 409 });
    await db.lead.update({ where: { id: ownCursorRow.id }, data: { ownerId: user.id } });

    let inserted = false;
    const wrapped = { $transaction: (runTransaction, options) => db.$transaction(async tx => {
      const lead = new Proxy(tx.lead, { get(target, key) {
        if (key === 'findMany') return async args => {
          const result = await target.findMany(args);
          if (!inserted) {
            inserted = true;
            // This uses a second real connection, committing after the board's
            // first SELECT but before its groupBy/count queries.
            await db.lead.create({ data: { ...rows[0], id: lateId, value: 1000000, expectedClose: '2026-01-31' } });
          }
          return result;
        };
        return target[key];
      } });
      return runTransaction({ lead, setting: tx.setting });
    }, options) };
    const during = await readLeadBoard(wrapped, user, new URLSearchParams(), now);
    assert.equal(inserted, true);
    assert.deepEqual(during.summary, first.summary, 'aggregate queries must retain the first SELECT snapshot');
    const after = await query();
    assert.equal(after.summary.total, first.summary.total + 1);
    assert.equal(after.summary.openValue, first.summary.openValue + 1000000);
  } finally {
    try { await db.lead.deleteMany({ where: { id: { in: ids } } }); }
    finally { await db.$disconnect(); }
  }
});
