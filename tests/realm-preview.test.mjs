import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PREVIEW_URL, probeRealmPreview, runRealmPreview } from '../scripts/realm-preview.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'realm-preview-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.next'), { recursive: true });
  await fs.mkdir(path.join(root, 'node_modules/next/dist/bin'), { recursive: true });
  await fs.writeFile(path.join(root, '.next/BUILD_ID'), 'test-build-91');
  await fs.writeFile(path.join(root, '.next/required-server-files.json'), '{}');
  await fs.writeFile(path.join(root, 'node_modules/next/dist/bin/next'), '// test only');
  return root;
}

test('readiness verifies the running RSC build and a successful HTML page', async () => {
  const calls = [];
  const result = await probeRealmPreview({ buildId: 'build-1', occupiedImpl: async () => true,
    requestImpl: async (url, options) => {
      calls.push({ url, options });
      return options.rsc ? { status: 200, type: 'text/x-component', body: '0:{"b":"build-1","f":[]}' }
        : { status: 200, type: 'text/html; charset=utf-8', body: '<html></html>' };
    } });
  assert.deepEqual(result, { state: 'ready', servedBuildId: 'build-1' });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url === PREVIEW_URL));
  for (const response of [
    { status: 200, type: 'text/x-component', body: '0:{"b":"older-build"}' },
    { status: 200, type: 'text/html', body: 'unrelated service' },
    { status: 404, type: 'text/x-component', body: '0:{"b":"build-1"}' },
  ]) {
    const occupied = await probeRealmPreview({ buildId: 'build-1', occupiedImpl: async () => true, requestImpl: async () => response });
    assert.equal(occupied.state, 'occupied');
  }
  assert.equal((await probeRealmPreview({ buildId: 'build-1', occupiedImpl: async () => true, requestImpl: async () => { throw new Error('timeout'); } })).state, 'occupied');
  assert.equal((await probeRealmPreview({ buildId: 'build-1', occupiedImpl: async () => false })).state, 'stopped');
});

test('start detaches a hidden loopback Next process with logfile descriptors and records its PID', async t => {
  const root = await fixture(t), spawned = [];
  let probes = 0, unref = 0;
  const result = await runRealmPreview({ root, probeImpl: async () => ({ state: probes++ ? 'ready' : 'stopped', servedBuildId: 'test-build-91' }),
    aliveImpl: () => false, spawnImpl: (command, args, options) => {
      spawned.push({ command, args, options });
      const child = new EventEmitter(); child.pid = 32123; child.unref = () => { unref += 1; };
      queueMicrotask(() => child.emit('spawn')); return child;
    } });
  assert.equal(result.state, 'ready'); assert.equal(result.pid, 32123); assert.equal(result.reused, false);
  assert.equal(spawned.length, 1); assert.equal(unref, 1);
  const { command, args, options } = spawned[0];
  assert.equal(command, process.execPath);
  assert.deepEqual(args.slice(1), ['start', '--hostname', '127.0.0.1', '--port', '3410']);
  assert.equal(options.detached, true); assert.equal(options.windowsHide, true); assert.equal(options.cwd, root);
  assert.equal(options.env, undefined, 'The launcher must not change auth/environment configuration');
  assert.equal(options.stdio[0], 'ignore'); assert.equal(options.stdio[1], options.stdio[2]); assert.equal(typeof options.stdio[1], 'number');
  const record = JSON.parse(await fs.readFile(path.join(root, '.codex-runtime/realm-preview.pid.json'), 'utf8'));
  assert.equal(record.pid, 32123); assert.equal(record.buildId, 'test-build-91'); assert.equal(record.root, root);
  await assert.rejects(fs.access(path.join(root, '.codex-runtime/realm-preview.start.lock')));
});

test('repeated start reuses a matching live build and never spawns over occupied ports', async t => {
  const root = await fixture(t);
  const spawnImpl = () => { throw new Error('Must not spawn'); };
  const ready = await runRealmPreview({ root, spawnImpl, probeImpl: async () => ({ state: 'ready', servedBuildId: 'test-build-91' }) });
  assert.equal(ready.reused, true);
  await assert.rejects(runRealmPreview({ root, spawnImpl, probeImpl: async () => ({ state: 'occupied', servedBuildId: 'old-build' }) }), /occupied.*old-build/);
});

test('status is read-only and an incomplete build never launches Next', async t => {
  const root = await fixture(t), spawnImpl = () => { throw new Error('Must not spawn'); };
  const status = await runRealmPreview({ root, action: 'status', spawnImpl, probeImpl: async () => ({ state: 'stopped' }) });
  assert.equal(status.state, 'stopped'); assert.equal(status.buildId, 'test-build-91');
  await assert.rejects(fs.access(path.join(root, '.codex-runtime')));
  await fs.unlink(path.join(root, '.next/BUILD_ID'));
  await assert.rejects(runRealmPreview({ root, spawnImpl }), /No complete production Next build/);
  await assert.rejects(fs.access(path.join(root, '.codex-runtime')));
});

test('a startup deadline preserves diagnostic PID/logs and releases the start lock without killing the process', async t => {
  const root = await fixture(t);
  let time = 0, killed = 0;
  await assert.rejects(runRealmPreview({ root, readinessMs: 1000, now: () => time, pauseImpl: async milliseconds => { time += milliseconds; },
    probeImpl: async () => ({ state: 'stopped' }), aliveImpl: () => false,
    spawnImpl: () => { const child = new EventEmitter(); child.pid = 32124; child.unref = () => {}; child.kill = () => { killed += 1; }; queueMicrotask(() => child.emit('spawn')); return child; },
  }), /readiness timed out/);
  assert.equal(killed, 0); assert.equal(time, 1000);
  await fs.access(path.join(root, '.codex-runtime/realm-preview.pid.json'));
  await fs.access(path.join(root, '.codex-runtime/realm-preview.log'));
  await assert.rejects(fs.access(path.join(root, '.codex-runtime/realm-preview.start.lock')));
});

test('spawn failure releases the lock and does not leave a false PID record', async t => {
  const root = await fixture(t);
  await assert.rejects(runRealmPreview({ root, probeImpl: async () => ({ state: 'stopped' }),
    spawnImpl: () => { const child = new EventEmitter(); queueMicrotask(() => child.emit('error', new Error('spawn failed'))); return child; },
  }), /spawn failed/);
  await assert.rejects(fs.access(path.join(root, '.codex-runtime/realm-preview.pid.json')));
  await assert.rejects(fs.access(path.join(root, '.codex-runtime/realm-preview.start.lock')));
});
