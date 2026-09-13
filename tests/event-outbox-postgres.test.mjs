import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { enqueueEvent, enqueueWebhook, claimOutboxJob, processOutboxJob, retryDeadOutboxJob, readOutboxPayload } from '../lib/event-outbox.js';

// Never load .env or use DATABASE_URL. This suite only writes its own generated
// IDs in an explicitly selected loopback disposable database. HTTP is stubbed.
const databaseUrl = process.env.OUTBOX_TEST_DATABASE_URL || process.env.PAYMENT_TEST_DATABASE_URL;
function assertDisposable(url) {
  const parsed = new URL(url);
  assert.ok(['postgresql:', 'postgres:'].includes(parsed.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /^\/codex_payment_test(?:_[a-zA-Z0-9_-]+)?$/);
}

function scopeClient(client, occurrenceId, failComplete = () => false) {
  return new Proxy(client, { get(target, property) {
    if (property === '$transaction') return (work, options) => target.$transaction(tx => work(scopeClient(tx, occurrenceId, failComplete)), options);
    if (property !== 'eventOutbox') return target[property];
    return new Proxy(target.eventOutbox, { get(delegate, method) {
      if (method === 'findMany') return args => delegate.findMany({ ...args, where: { AND: [args.where, { occurrenceId }] } });
      if (method === 'updateMany') return args => {
        if (args.data.status === 'delivered' && failComplete()) throw new Error('injected post-effects acknowledgement failure');
        return delegate.updateMany({ ...args, where: { AND: [args.where, { occurrenceId }] } });
      };
      return delegate[method];
    } });
  } });
}

test('PostgreSQL outbox atomicity, concurrent leases, recovery and HTTP uncertainty', { skip: !databaseUrl, timeout: 120000 }, async t => {
  assertDisposable(databaseUrl);
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const prefix = `outbox-test-${randomUUID()}`;
  const at = new Date('2026-09-08T10:00:00Z');
  const event = (suffix, extra = {}) => ({ occurrenceId: `${prefix}:${suffix}`, resource: 'tasks', event: 'create', row: { id: `${prefix}-task` }, user: { id: prefix, name: 'Outbox test' }, ...extra });
  const audit = suffix => ({ userId: prefix, userName: 'Outbox test', action: 'outbox-test', entity: 'tasks', refId: `${prefix}-${suffix}` });
  try {
    await t.test('transaction rollback includes the business row, audit and queued occurrence', async () => {
      await assert.rejects(prisma.$transaction(async tx => {
        const row = await tx.task.create({ data: { id: `${prefix}-rollback`, title: 'Outbox rollback' } });
        await tx.auditLog.create({ data: audit('rollback') });
        await enqueueEvent(tx, event('rollback', { row }), { now: at });
        throw new Error('after enqueue');
      }));
      assert.equal(await prisma.task.count({ where: { id: `${prefix}-rollback` } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { userId: prefix } }), 0);
      assert.equal(await prisma.eventOutbox.count({ where: { occurrenceId: `${prefix}:rollback` } }), 0);
    });

    await t.test('same occurrence concurrent enqueue creates one job; payload mismatch aborts its transaction', async () => {
      const input = event('duplicate');
      const created = await Promise.all([enqueueEvent(prisma, input, { now: at }), enqueueEvent(prisma, input, { now: at })]);
      assert.equal(created[0].id, created[1].id);
      assert.equal(await prisma.eventOutbox.count({ where: { occurrenceId: input.occurrenceId } }), 1);
      await assert.rejects(prisma.$transaction(async tx => {
        await tx.auditLog.create({ data: audit('conflict') });
        await enqueueEvent(tx, { ...input, row: { id: 'different' } }, { now: at });
      }), { code: 'OUTBOX_OCCURRENCE_CONFLICT' });
      assert.equal(await prisma.auditLog.count({ where: { userId: prefix } }), 0);
    });

    await t.test('concurrent claims select one owner, expired lease is reclaimed and stale worker is fenced', async () => {
      const input = event('lease');
      const db = scopeClient(prisma, input.occurrenceId);
      await enqueueEvent(db, input, { now: at });
      const claims = await Promise.all([claimOutboxJob(db, { now: at }), claimOutboxJob(db, { now: at })]);
      assert.equal(claims.filter(Boolean).length, 1);
      const first = claims.find(Boolean);
      const later = new Date(+at + 60_001);
      const second = await claimOutboxJob(db, { now: later });
      assert.notEqual(first.leaseToken, second.leaseToken);
      const local = tx => tx.auditLog.create({ data: audit('lease') });
      assert.equal((await processOutboxJob(db, first, { processLocal: local, clock: () => later })).status, 'lease_lost');
      assert.equal((await processOutboxJob(db, second, { processLocal: local, clock: () => later })).status, 'delivered');
      assert.equal(await prisma.auditLog.count({ where: { refId: `${prefix}-lease` } }), 1);
    });

    await t.test('effects, notification, fanout and completion share rollback, successful replay creates each once', async () => {
      const input = event('local');
      let fail = true;
      const db = scopeClient(prisma, input.occurrenceId, () => fail);
      await enqueueEvent(db, input, { now: at });
      const local = async (tx, payload, parent) => {
        await tx.task.create({ data: { id: `${prefix}-generated`, title: 'Generated exactly once' } });
        await tx.notification.create({ data: { userId: prefix, text: 'Outbox local' } });
        await enqueueWebhook(tx, parent, { deliveryKey: 'webhook:target', url: 'https://example.invalid', eventName: 'tasks.create', body: '{"test":true}' });
      };
      const first = await claimOutboxJob(db, { now: at });
      assert.equal((await processOutboxJob(db, first, { processLocal: local, clock: () => at })).status, 'pending');
      assert.equal(await prisma.task.count({ where: { id: `${prefix}-generated` } }), 0);
      assert.equal(await prisma.notification.count({ where: { userId: prefix } }), 0);
      assert.equal(await prisma.eventOutbox.count({ where: { occurrenceId: input.occurrenceId, kind: 'webhook' } }), 0);
      fail = false;
      const later = new Date(+at + 5000);
      const second = await claimOutboxJob(db, { now: later });
      assert.equal((await processOutboxJob(db, second, { processLocal: local, clock: () => later })).status, 'delivered');
      assert.equal((await processOutboxJob(db, second, { processLocal: local, clock: () => later })).status, 'lease_lost');
      assert.equal(await prisma.task.count({ where: { id: `${prefix}-generated` } }), 1);
      assert.equal(await prisma.notification.count({ where: { userId: prefix } }), 1);
      assert.equal(await prisma.eventOutbox.count({ where: { occurrenceId: input.occurrenceId, kind: 'webhook' } }), 1);
    });

    await t.test('HTTP success followed by lost acknowledgement retries with identical delivery ID and body', async () => {
      const occurrenceId = `${prefix}:http`;
      let fail = true;
      const db = scopeClient(prisma, occurrenceId, () => fail);
      await enqueueWebhook(db, { occurrenceId, resource: 'tasks', event: 'create', createdAt: at }, { deliveryKey: 'webhook:1', url: 'https://example.invalid', eventName: 'tasks.create', body: '{"at":"fixed"}' });
      const sent = [];
      const sendWebhook = async (payload, job) => { sent.push({ id: job.id, occurrenceId: job.occurrenceId, body: payload.body }); };
      const first = await claimOutboxJob(db, { now: at });
      assert.equal((await processOutboxJob(db, first, { sendWebhook, clock: () => at })).status, 'pending');
      fail = false;
      const later = new Date(+at + 5000);
      const second = await claimOutboxJob(db, { now: later });
      assert.equal((await processOutboxJob(db, second, { sendWebhook, clock: () => later })).status, 'delivered');
      assert.equal(sent.length, 2);
      assert.deepEqual(sent[0], sent[1]);
      assert.equal(readOutboxPayload(second).body, sent[0].body);
    });

    await t.test('last failed attempt dead-letters safely and explicit retry cannot reopen delivered occurrence', async () => {
      const input = event('dead');
      const db = scopeClient(prisma, input.occurrenceId);
      const { id } = await enqueueEvent(db, input, { now: at });
      await prisma.eventOutbox.update({ where: { id }, data: { attempts: 7 } });
      const job = await claimOutboxJob(db, { now: at });
      const result = await processOutboxJob(db, job, { processLocal: async () => { throw new Error('https://private/?secret=private'); }, clock: () => at });
      assert.equal(result.status, 'dead');
      const stored = await prisma.eventOutbox.findUnique({ where: { id } });
      assert.equal(stored.lastErrorCode, 'OUTBOX_DELIVERY_FAILED');
      assert.equal((await retryDeadOutboxJob(db, id, { now: at })).count, 1);
      const retry = await claimOutboxJob(db, { now: at });
      assert.equal((await processOutboxJob(db, retry, { processLocal: async () => {}, clock: () => at })).status, 'delivered');
      assert.equal((await retryDeadOutboxJob(db, id, { now: at })).count, 0);
    });
  } finally {
    await prisma.eventOutbox.deleteMany({ where: { occurrenceId: { startsWith: prefix } } });
    await prisma.notification.deleteMany({ where: { userId: prefix } });
    await prisma.auditLog.deleteMany({ where: { userId: prefix } });
    await prisma.task.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.$disconnect();
  }
});
