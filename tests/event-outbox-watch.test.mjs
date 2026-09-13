import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parseOutboxArgs, watchOutbox, waitForOutboxPoll } from '../lib/event-outbox-watch.js';
import { enqueueEvent, runOutboxBatch } from '../lib/event-outbox.js';
import { createOutboxMemoryDB } from './helpers/outbox-memory-db.mjs';
import { startDevWorkspace } from '../scripts/dev-workspace.mjs';

test('watch arguments are explicit and bounded before opening a database', () => {
  assert.deepEqual(parseOutboxArgs(['watch', '--poll-ms', '200', '--limit', '5']), { command: 'watch', pollMs: 200, limit: 5 });
  for (const args of [['watch', '--poll-ms', '0'], ['watch', '--poll-ms', 'NaN'], ['watch', '--limit', '1001'], ['run', '--poll-ms', '1000'], ['watch', '--limit'], ['watch', '--limit', '5', '--limit', '6'], ['retry']]) assert.throws(() => parseOutboxArgs(args));
  assert.equal(parseOutboxArgs([]).command, 'help');
});

test('watch runs sequential bounded batches, stays quiet when idle and recovers from DB errors with safe logs', async () => {
  const controller = new AbortController();
  let calls = 0;
  let pauses = 0;
  const messages = [];
  const errors = [];
  await watchOutbox({}, {}, {
    signal: controller.signal, limit: 7, pollMs: 200,
    logger: text => messages.push(text), errorLogger: text => errors.push(text),
    batch: async (db, handlers, options) => {
      assert.equal(options.limit, 7);
      calls++;
      if (calls === 1) return [];
      if (calls === 2) throw new Error('postgres://private:secret@database');
      controller.abort();
      return [{ id: 'job-1', status: 'delivered' }];
    },
    pause: async (ms, signal) => { assert.equal(ms, 200); assert.equal(signal, controller.signal); pauses++; },
  });
  assert.equal(calls, 3);
  assert.equal(pauses, 2);
  assert.equal(messages.length, 1);
  assert.deepEqual(errors, ['OUTBOX_DELIVERY_FAILED']);
});

test('shutdown drains current job and leaves the next occurrence pending', async () => {
  const db = createOutboxMemoryDB();
  const at = new Date('2026-09-08T10:00:00Z');
  for (const occurrenceId of ['first', 'second']) await enqueueEvent(db, { occurrenceId, resource: 'tasks', event: 'create', row: { id: occurrenceId } }, { now: at });
  const controller = new AbortController();
  const results = await runOutboxBatch(db, { processLocal: async tx => {
    controller.abort();
    await tx.notification.create({ data: { text: 'Finished current job', userId: 'test' } });
  } }, { signal: controller.signal, clock: () => at });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'delivered');
  assert.equal(db.rows('eventOutbox').filter(row => row.status === 'pending').length, 1);
  assert.equal(db.rows('notification').length, 1);
});

test('abort immediately wakes a pending poll delay', async () => {
  const controller = new AbortController();
  const pending = waitForOutboxPoll(60_000, controller.signal);
  controller.abort();
  await pending;
  await waitForOutboxPoll(60_000, controller.signal);
});

function childFixture(platform = 'linux') {
  const host = new EventEmitter();
  host.platform = platform;
  host.execPath = '/node';
  const spawned = [];
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter();
    child.pid = spawned.length + 100;
    child.connected = Array.isArray(options.stdio);
    child.killed = [];
    child.messages = [];
    child.kill = signal => { child.killed.push(signal); queueMicrotask(() => child.emit('close', 0)); };
    child.send = (message, callback) => { child.messages.push(message); queueMicrotask(() => { callback?.(); child.emit('close', 0); }); };
    spawned.push({ command, args, options, child });
    if (command === 'taskkill') queueMicrotask(() => spawned.find(row => row.child.pid === Number(args[1]))?.child.emit('close', 0));
    return child;
  };
  return { host, spawnImpl, spawned };
}

test('dev wrapper flag off launches only Next and preserves explicit port/env', async () => {
  const fixture = childFixture();
  const env = { DATABASE_URL: 'fixture-only', EVENT_OUTBOX_WORKER_ENABLED: '0' };
  const workspace = startDevWorkspace({ ...fixture, env, args: ['-p', '3418'], nextPath: '/next' });
  assert.equal(fixture.spawned.length, 1);
  assert.deepEqual(fixture.spawned[0].args, ['/next', 'dev', '-p', '3418']);
  assert.equal(fixture.spawned[0].options.env, env);
  fixture.host.emit('SIGTERM');
  assert.equal(await workspace.done, 0);
  assert.equal(fixture.host.listenerCount('SIGTERM'), 0);
});

test('opt-in wrapper forwards shutdown to worker IPC and Next; worker failure stops workspace', async () => {
  for (const failure of [false, true]) {
    const fixture = childFixture();
    const workspace = startDevWorkspace({ ...fixture, env: { EVENT_OUTBOX_WORKER_ENABLED: '1', EVENT_OUTBOX_POLL_MS: '250' }, nextPath: '/next' });
    assert.equal(fixture.spawned.length, 2);
    const [next, worker] = fixture.spawned;
    assert.deepEqual(worker.args.slice(1), ['watch', '--limit', '100', '--poll-ms', '250']);
    if (failure) worker.child.emit('close', 2);
    else fixture.host.emit('SIGINT');
    assert.equal(await workspace.done, failure ? 1 : 0);
    assert.deepEqual(next.child.killed, ['SIGTERM']);
    if (!failure) assert.deepEqual(worker.child.messages, [{ type: 'outbox:shutdown' }]);
  }
});

test('Windows wrapper targets only owned Next process tree while worker drains over IPC', async () => {
  const fixture = childFixture('win32');
  const workspace = startDevWorkspace({ ...fixture, env: { EVENT_OUTBOX_WORKER_ENABLED: '1' }, nextPath: 'C:/next.js' });
  workspace.stop();
  assert.equal(await workspace.done, 0);
  const kill = fixture.spawned.find(row => row.command === 'taskkill');
  assert.deepEqual(kill.args, ['/PID', String(fixture.spawned[0].child.pid), '/T', '/F']);
  assert.equal(kill.options.windowsHide, true);
  assert.deepEqual(fixture.spawned[1].child.messages, [{ type: 'outbox:shutdown' }]);
});
