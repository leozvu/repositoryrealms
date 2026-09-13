import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createOutboxMemoryDB } from './helpers/outbox-memory-db.mjs';
import { enqueueEvent, enqueueWebhook, claimOutboxJob, processOutboxJob, readOutboxPayload, retryDeadOutboxJob, retryDelayMs, OutboxError, outboxErrorCode } from '../lib/event-outbox.js';
register('./helpers/event-outbox-loader.mjs', import.meta.url);
const { processDurableEvent, sendDurableWebhook, notify, usersWithRole } = await import('../lib/events.js');
const at = new Date('2026-09-08T10:00:00Z');
const event = overrides => ({ occurrenceId: 'occurrence-1', resource: 'tasks', event: 'create', row: { id: 'task-1', title: 'Task' }, user: { id: 'actor', name: 'Actor', password: 'never-stored' }, ...overrides });
const clock = () => new Date(at);

test('business mutation + audit + enqueue roll back together on enqueue failure', async () => {
  const db = createOutboxMemoryDB();
  db.fail = (model, method) => model === 'eventOutbox' && method === 'upsert';
  await assert.rejects(db.$transaction(async tx => {
    await tx.task.create({ data: { id: 'task-1' } });
    await tx.auditLog.create({ data: { action: 'create' } });
    await enqueueEvent(tx, event(), { now: at });
  }));
  for (const table of ['task', 'auditLog', 'eventOutbox']) assert.equal(db.rows(table).length, 0);
});

test('occurrence deduplication preserves job and rejects payload drift without conflating separate updates', async () => {
  const db = createOutboxMemoryDB();
  const first = await enqueueEvent(db, event(), { now: at });
  assert.deepEqual(await enqueueEvent(db, event({ row: { title: 'Task', id: 'task-1' } })), first);
  assert.equal(db.rows('eventOutbox').length, 1);
  assert.ok(!db.rows('eventOutbox')[0].payload.includes('never-stored'));
  await assert.rejects(enqueueEvent(db, event({ row: { id: 'task-1', title: 'Changed' } })), { code: 'OUTBOX_OCCURRENCE_CONFLICT' });
  await enqueueEvent(db, event({ occurrenceId: 'occurrence-2' }), { now: at });
  assert.equal(db.rows('eventOutbox').length, 2);
});

test('durable snapshots strip known credential fields including nested previous records', async () => {
  const db = createOutboxMemoryDB();
  await enqueueEvent(db, event({ row: { id: 'user', passwordHash: 'pw-secret', totpSecret: '2fa-secret', nested: { access_token: 'api-secret', name: 'Kept' } }, old: { apiKey: 'old-secret' } }));
  const payload = readOutboxPayload(db.rows('eventOutbox')[0]);
  assert.deepEqual(payload.row, { id: 'user', nested: { name: 'Kept' } });
  assert.deepEqual(payload.old, {});
});

test('financial Decimal amounts and Date snapshots retain their JSON values', async () => {
  const db = createOutboxMemoryDB();
  await enqueueEvent(db, event({ resource: 'invoices', row: { id: 'invoice-1', total: new Prisma.Decimal('98765432109876543210'), createdAt: at } }));
  const payload = readOutboxPayload(db.rows('eventOutbox')[0]);
  assert.equal(payload.row.total, '98765432109876543210');
  assert.equal(payload.row.createdAt, at.toISOString());
});

test('local effects + notification + HTTP fanout roll back if completion fails, then commit once on retry', async () => {
  const db = createOutboxMemoryDB();
  await enqueueEvent(db, event(), { now: at });
  const job = await claimOutboxJob(db, { now: at });
  const local = async (tx, payload, parent) => {
    await tx.task.create({ data: { title: 'Generated task' } });
    await tx.notification.createMany({ data: [{ userId: 'u1', text: 'Generated' }] });
    await enqueueWebhook(tx, parent, { deliveryKey: 'webhook:1', url: 'https://example.invalid/hook', eventName: 'tasks.create', body: '{"ok":true}' });
  };
  db.fail = (model, method, args) => model === 'eventOutbox' && method === 'updateMany' && args.data.status === 'delivered';
  const failed = await processOutboxJob(db, job, { processLocal: local, clock });
  assert.equal(failed.status, 'pending');
  assert.equal(failed.errorCode, 'OUTBOX_DELIVERY_FAILED');
  assert.equal(db.rows('task').length, 0);
  assert.equal(db.rows('notification').length, 0);
  assert.equal(db.rows('eventOutbox').length, 1);
  assert.equal(await claimOutboxJob(db, { now: new Date(+at + 4999) }), null);
  db.fail = null;
  const retryAt = new Date(+at + 5000);
  const retry = await claimOutboxJob(db, { now: retryAt });
  assert.equal((await processOutboxJob(db, retry, { processLocal: local, clock: () => retryAt })).status, 'delivered');
  assert.equal((await processOutboxJob(db, retry, { processLocal: local, clock: () => retryAt })).status, 'lease_lost');
  assert.equal(db.rows('task').length, 1);
  assert.equal(db.rows('notification').length, 1);
  assert.equal(db.rows('eventOutbox').filter(row => row.kind === 'webhook').length, 1);
});

test('concurrent claims give one owner; an expired stale worker cannot commit local effects', async () => {
  const db = createOutboxMemoryDB();
  await enqueueEvent(db, event(), { now: at });
  const claims = await Promise.all([claimOutboxJob(db, { now: at }), claimOutboxJob(db, { now: at })]);
  assert.equal(claims.filter(Boolean).length, 1);
  const first = claims.find(Boolean);
  const later = new Date(+at + 60_001);
  const second = await claimOutboxJob(db, { now: later });
  let effects = 0;
  const processLocal = async () => { effects++; };
  assert.equal((await processOutboxJob(db, first, { processLocal, clock: () => later })).status, 'lease_lost');
  assert.equal((await processOutboxJob(db, second, { processLocal, clock: () => later })).status, 'delivered');
  assert.equal(effects, 1);
});

test('bounded backoff and dead-letter; operator retry never replays delivered events', async () => {
  const db = createOutboxMemoryDB();
  await enqueueEvent(db, event(), { now: at });
  let now = at;
  let finalJob;
  for (let attempt = 1; attempt <= 8; attempt++) {
    finalJob = await claimOutboxJob(db, { now });
    assert.equal(finalJob.attempts, attempt);
    const result = await processOutboxJob(db, finalJob, { processLocal: async () => { throw new Error('url-token-secret'); }, clock: () => now });
    assert.equal(result.status, attempt === 8 ? 'dead' : 'pending');
    now = new Date(+now + retryDelayMs(attempt));
  }
  assert.equal(await claimOutboxJob(db, { now }), null);
  assert.equal((await retryDeadOutboxJob(db, finalJob.id, { now })).count, 1);
  const retried = await claimOutboxJob(db, { now });
  assert.equal(retried.attempts, 1);
  await processOutboxJob(db, retried, { processLocal: async () => {}, clock: () => now });
  assert.equal((await retryDeadOutboxJob(db, finalJob.id, { now })).count, 0);
  assert.equal(retryDelayMs(100), 3_600_000);
});

test('exhausted abandoned leases enter dead letter without executing', async () => {
  const db = createOutboxMemoryDB();
  await enqueueEvent(db, event(), { now: at });
  await db.eventOutbox.updateMany({ where: {}, data: { status: 'processing', attempts: 8, leaseUntil: new Date(+at - 1) } });
  assert.equal(await claimOutboxJob(db, { now: at }), null);
  assert.equal(db.rows('eventOutbox')[0].status, 'dead');
});

test('corrupt payload and unknown versions dead-letter before effects', async () => {
  for (const mutate of [row => ({ ...row, payloadVersion: 99 }), row => ({ ...row, payload: '{"tampered":true}' })]) {
    const db = createOutboxMemoryDB();
    await enqueueEvent(db, event(), { now: at });
    db.seed('eventOutbox', db.rows('eventOutbox').map(mutate));
    const job = await claimOutboxJob(db, { now: at });
    const result = await processOutboxJob(db, job, { processLocal: () => assert.fail('must not run'), clock });
    assert.equal(result.status, 'dead');
    assert.ok(['OUTBOX_UNSUPPORTED_VERSION', 'OUTBOX_HASH_MISMATCH'].includes(result.errorCode));
  }
});

test('actual recurring-task automation rolls back Gold, notifications and child task together then retries once', async () => {
  const task = { id: 'task-1', title: 'Weekly report', status: 'done', assigneeId: 'worker', dueDate: '2026-09-08', recur: 'weekly', priority: 'medium', checklist: '[{"text":"Review","done":true}]' };
  const db = createOutboxMemoryDB({ task: [task], setting: [{ id: 1, json: '{"goldEnabled":true}' }], rule: [{ id: 'r1', resource: 'tasks', event: 'update', active: true, conditions: '[]', actions: '[{"type":"webhook","url":"https://example.invalid/rule"}]', name: 'Rule' }], webhook: [{ id: 'h1', active: true, url: 'https://example.invalid/hook', secret: 'do-not-copy', events: '["tasks.*"]' }] });
  await enqueueEvent(db, event({ event: 'update', row: task, old: { ...task, status: 'doing' } }), { now: at });
  const first = await claimOutboxJob(db, { now: at });
  db.fail = (model, method) => model === 'auditLog' && method === 'create';
  assert.equal((await processOutboxJob(db, first, { processLocal: processDurableEvent, clock })).status, 'pending');
  assert.equal(db.rows('task').length, 1);
  assert.equal(db.rows('notification').length, 0);
  assert.equal(db.rows('realmGoldEntry').length, 0);
  assert.equal(db.rows('realmChangeEvent').length, 0);
  db.fail = null;
  const retryAt = new Date(+at + 5000);
  const retry = await claimOutboxJob(db, { now: retryAt });
  assert.equal((await processOutboxJob(db, retry, { processLocal: processDurableEvent, clock: () => retryAt })).status, 'delivered');
  const child = db.rows('task').find(row => row.id !== task.id);
  assert.equal(child.dueDate, '2026-09-15');
  assert.equal(JSON.parse(child.checklist)[0].done, false);
  assert.equal(db.rows('realmGoldEntry').length, 1);
  assert.equal(db.rows('notification').length, 2);
  assert.ok(db.rows('notification').some(row => row.route.includes(child.id)));
  const deliveries = db.rows('eventOutbox').filter(row => row.kind === 'webhook');
  assert.equal(deliveries.length, 2);
  assert.ok(deliveries.every(row => !row.payload.includes('do-not-copy')));
  assert.ok(deliveries.every(row => JSON.parse(readOutboxPayload(row).body).at === at.toISOString()));
});

test('tx-injected notify and role lookup never access global client and propagate DB failure', async () => {
  const db = createOutboxMemoryDB({ user: [{ id: 'hr', status: 'active', roles: '["HR"]' }, { id: 'director', status: 'active', role: 'DIRECTOR' }] });
  assert.equal((await usersWithRole('HR', { db })).length, 2);
  await notify(['hr', 'hr'], 'Hello', '/tasks?focus=a', { db });
  assert.equal(db.rows('notification').length, 1);
  db.fail = model => model === 'notification';
  await assert.rejects(notify('hr', 'Hello', '/tasks', { db }));
});

test('HTTP retries use identical body and stable event/delivery IDs; 429 retries, 400 dead-letters', async () => {
  const db = createOutboxMemoryDB({ webhook: [{ id: 'h1', active: true, url: 'https://example.invalid/hook', secret: 'signature-secret' }] });
  await enqueueWebhook(db, { occurrenceId: 'http-1', resource: 'tasks', event: 'create', createdAt: at }, { deliveryKey: 'webhook:h1', hookId: 'h1', url: 'https://example.invalid/hook', eventName: 'tasks.create', body: '{"event":"tasks.create","at":"fixed"}' });
  const calls = [];
  let status = 429;
  const sendWebhook = (payload, job) => sendDurableWebhook(db, payload, job, { fetchImpl: async (url, options) => { calls.push({ url, ...options }); return { status, ok: status >= 200 && status < 300 }; } });
  const first = await claimOutboxJob(db, { now: at });
  assert.equal((await processOutboxJob(db, first, { sendWebhook, clock })).status, 'pending');
  status = 200;
  const later = new Date(+at + 5000);
  const retry = await claimOutboxJob(db, { now: later });
  assert.equal((await processOutboxJob(db, retry, { sendWebhook, clock: () => later })).status, 'delivered');
  assert.equal(calls[0].body, calls[1].body);
  assert.deepEqual(calls[0].headers, calls[1].headers);
  assert.equal(calls[0].headers['X-Event-Id'], 'http-1');
  assert.equal(calls[0].headers['X-Delivery-Id'], first.id);
  assert.equal(calls[0].headers['X-Signature'], createHmac('sha256', 'signature-secret').update(calls[0].body).digest('hex'));
  assert.equal(calls[0].redirect, 'error');
  status = 400;
  await assert.rejects(sendWebhook(readOutboxPayload(first), first), { code: 'HTTP_400', permanent: true });
  db.seed('webhook', []);
  await assert.rejects(sendWebhook(readOutboxPayload(first), first), { code: 'OUTBOX_TARGET_DISABLED' });
});

test('error classification never persists arbitrary exception messages', () => {
  assert.equal(outboxErrorCode(new Error('secret token in URL')), 'OUTBOX_DELIVERY_FAILED');
  assert.equal(outboxErrorCode({ code: 'secret=123' }), 'OUTBOX_DELIVERY_FAILED');
  assert.equal(outboxErrorCode(new OutboxError('HTTP_503')), 'HTTP_503');
  assert.equal(outboxErrorCode({ name: 'TimeoutError' }), 'OUTBOX_TIMEOUT');
});
