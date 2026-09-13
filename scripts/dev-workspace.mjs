#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);

/** Next and optional worker share configuration and lifecycle. No detached
 * worker, scheduled task or shell-built command. Exported for lifecycle tests. */
export function startDevWorkspace({ env = process.env, args = [], spawnImpl = spawn, host = process, graceMs = 35_000, nextPath = require.resolve('next/dist/bin/next') } = {}) {
  const portProvided = args.some(arg => arg === '-p' || arg === '--port' || arg.startsWith('--port='));
  const nextArgs = ['dev', ...args, ...(portProvided ? [] : ['-p', env.PORT || '3300'])];
  const children = [];
  let stopping = false;
  let exitCode = 0;
  let forceTimer;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const force = child => {
    if (child.closed) return;
    if (host.platform === 'win32') {
      // Target only this wrapper's owned child tree; Next dev may fork a server.
      const killer = spawnImpl('taskkill', ['/PID', String(child.process.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.process.kill());
    } else child.process.kill('SIGKILL');
  };
  const finish = () => {
    if (!stopping || children.some(child => !child.closed)) return;
    clearTimeout(forceTimer);
    host.removeListener('SIGINT', signalStop);
    host.removeListener('SIGTERM', signalStop);
    resolveDone(exitCode);
  };
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const child of children) {
      if (child.closed) continue;
      if (child.name === 'outbox' && child.process.connected) child.process.send({ type: 'outbox:shutdown' }, () => {});
      else if (host.platform === 'win32') force(child);
      else child.process.kill('SIGTERM');
    }
    forceTimer = setTimeout(() => children.forEach(force), graceMs);
    forceTimer.unref?.();
    finish();
  };
  const signalStop = () => stop(0);
  const launch = (name, commandArgs, ipc = false) => {
    let childProcess;
    try { childProcess = spawnImpl(host.execPath, commandArgs, { env, windowsHide: true, stdio: ipc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit' }); }
    catch { stop(1); return; }
    const child = { name, closed: false, process: childProcess };
    children.push(child);
    child.process.on('error', () => { child.closed = true; stop(1); finish(); });
    child.process.on('close', code => { child.closed = true; if (!stopping) stop(name === 'outbox' ? 1 : (code || 0)); finish(); });
  };
  host.once('SIGINT', signalStop);
  host.once('SIGTERM', signalStop);
  launch('next', [nextPath, ...nextArgs]);
  if (!stopping && env.EVENT_OUTBOX_WORKER_ENABLED === '1') {
    launch('outbox', [fileURLToPath(new URL('./event-outbox-worker.mjs', import.meta.url)), 'watch', '--limit', env.EVENT_OUTBOX_BATCH_SIZE || '100', '--poll-ms', env.EVENT_OUTBOX_POLL_MS || '1000'], true);
  }
  return { stop, done };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    // Same installed loader as Next; explicit env wins. Never print secrets.
    const { loadEnvConfig } = require('@next/env');
    loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    const workspace = startDevWorkspace({ args: process.argv.slice(2) });
    process.exitCode = await workspace.done;
  } catch {
    console.error('DEV_WORKSPACE_START_FAILED');
    process.exitCode = 1;
  }
}
