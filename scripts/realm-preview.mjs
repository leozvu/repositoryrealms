#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { get } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

export const PREVIEW_HOST = '127.0.0.1';
export const PREVIEW_PORT = 3410;
export const PREVIEW_URL = `http://${PREVIEW_HOST}:${PREVIEW_PORT}/realm-demo?world=3d`;
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUILD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function paths(root) {
  const runtime = path.join(root, '.codex-runtime');
  return { runtime, record: path.join(runtime, 'realm-preview.pid.json'), lock: path.join(runtime, 'realm-preview.start.lock'),
    log: path.join(runtime, 'realm-preview.log'), next: path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next') };
}

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function readRecord(file, root) {
  try {
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    return record.version === 1 && record.root === root && record.host === PREVIEW_HOST && record.port === PREVIEW_PORT
      && Number.isSafeInteger(record.pid) && record.pid > 0 && BUILD_ID_PATTERN.test(record.buildId) ? record : null;
  } catch { return null; }
}

async function readBuild(root) {
  try {
    const buildId = (await fs.readFile(path.join(root, '.next', 'BUILD_ID'), 'utf8')).trim();
    if (!BUILD_ID_PATTERN.test(buildId)) throw new Error('Invalid BUILD_ID');
    await fs.access(path.join(root, '.next', 'required-server-files.json'));
    await fs.access(paths(root).next);
    return buildId;
  } catch {
    throw new Error('No complete production Next build is available. Finish npm run build with this preview stopped, then run node scripts/realm-preview.mjs.');
  }
}

async function portOccupied() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolve(true) : reject(error));
    probe.listen({ host: PREVIEW_HOST, port: PREVIEW_PORT, exclusive: true }, () => probe.close(() => resolve(false)));
  });
}

// Request deadlines cover headers and body; an unrelated local server cannot
// hold readiness forever or stream unbounded content into memory.
function request(url, { rsc = false, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const req = get(url, { headers: { 'Cache-Control': 'no-cache', ...(rsc ? { RSC: '1' } : {}) } }, response => {
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) req.destroy(new Error('Preview response exceeds the readiness limit.'));
        else chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'] || '', body: Buffer.concat(chunks).toString('utf8') }));
    });
    const timer = setTimeout(() => req.destroy(new Error('Preview readiness request timed out.')), timeoutMs);
    req.once('error', reject);
    req.once('close', () => clearTimeout(timer));
  });
}

export async function probeRealmPreview({ buildId, timeoutMs = 5000, requestImpl = request, occupiedImpl = portOccupied } = {}) {
  if (!await occupiedImpl()) return { state: 'stopped' };
  try {
    const flight = await requestImpl(PREVIEW_URL, { rsc: true, timeoutMs });
    const servedBuildId = flight.type.includes('text/x-component') ? flight.body.match(/"b":"([a-zA-Z0-9_-]+)"/)?.[1] : null;
    if (flight.status !== 200 || servedBuildId !== buildId) return { state: 'occupied', servedBuildId: servedBuildId || null };
    const page = await requestImpl(PREVIEW_URL, { timeoutMs });
    if (page.status !== 200 || !page.type.includes('text/html')) return { state: 'occupied', servedBuildId };
    return { state: 'ready', servedBuildId };
  } catch { return { state: 'occupied', servedBuildId: null }; }
}

async function acquireLock(file, aliveImpl) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(file, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid }));
      return async () => { await handle.close(); await fs.unlink(file).catch(() => {}); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(await fs.readFile(file, 'utf8')).pid; } catch { /* A live starter may still be writing its lock. */ }
      if (!Number.isSafeInteger(owner) || owner < 1 || aliveImpl(owner)) throw new Error('Another preview start owns the lock. Wait for it to finish, then retry.');
      await fs.unlink(file).catch(() => {});
    }
  }
  throw new Error('Could not acquire the preview start lock.');
}

/** Detached production preview; never builds, changes configuration or kills a PID. */
export async function runRealmPreview({ root = PROJECT_ROOT, action = 'start', spawnImpl = spawn, probeImpl = probeRealmPreview,
  aliveImpl = pidAlive, pauseImpl = pause, now = Date.now, readinessMs = 45_000 } = {}) {
  if (!['start', 'status'].includes(action)) throw new Error('Usage: node scripts/realm-preview.mjs [--status]');
  root = path.resolve(root);
  const files = paths(root), buildId = await readBuild(root);
  const describe = async () => {
    const state = await probeImpl({ buildId });
    const record = await readRecord(files.record, root);
    const recordedAlive = Boolean(record && aliveImpl(record.pid));
    return { ...state, buildId, url: PREVIEW_URL, pid: recordedAlive && record.buildId === buildId ? record.pid : null,
      recordedProcessActive: recordedAlive, recordedBuildId: recordedAlive ? record.buildId : null, log: files.log };
  };
  if (action === 'status') return describe();
  await fs.mkdir(files.runtime, { recursive: true });
  const release = await acquireLock(files.lock, aliveImpl);
  try {
    const previous = await describe();
    if (previous.state === 'ready') return { ...previous, reused: true };
    if (previous.state === 'occupied') throw new Error(`Port ${PREVIEW_HOST}:${PREVIEW_PORT} is occupied by an unverified server${previous.servedBuildId ? ` (build ${previous.servedBuildId})` : ''}. No process was stopped. Use --status and identify that server before replacing it.`);
    if (previous.recordedProcessActive && previous.recordedBuildId !== buildId) throw new Error('The recorded preview process belongs to another build and is still active. No new server was started.');
    let child, exited = false;
    if (!previous.recordedProcessActive) {
      const log = await fs.open(files.log, 'a');
      try {
        await log.write(`\nRealm preview ${buildId} · ${new Date(now()).toISOString()}\n`);
        child = spawnImpl(process.execPath, [files.next, 'start', '--hostname', PREVIEW_HOST, '--port', String(PREVIEW_PORT)], {
          cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
        });
        child.once('exit', () => { exited = true; });
        await once(child, 'spawn');
        child.unref();
        const record = { version: 1, pid: child.pid, root, host: PREVIEW_HOST, port: PREVIEW_PORT, buildId,
          url: PREVIEW_URL, startedAt: new Date(now()).toISOString() };
        const temporary = `${files.record}.${process.pid}.tmp`;
        await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`);
        await fs.rename(temporary, files.record);
      } finally { await log.close(); }
    }
    const deadline = now() + Math.max(1000, Math.min(45_000, readinessMs));
    while (now() < deadline) {
      if (exited) throw new Error(`The preview exited during startup. Inspect ${files.log}.`);
      const state = await probeImpl({ buildId, timeoutMs: Math.min(5000, Math.max(100, Math.floor((deadline - now()) / 2))) });
      if (state.state === 'ready') {
        if (await readBuild(root) !== buildId) throw new Error('The build changed during startup. Stop rebuilding while the preview is running.');
        return { ...state, buildId, url: PREVIEW_URL, pid: child?.pid || previous.pid, reused: !child, log: files.log };
      }
      await pauseImpl(Math.min(350, Math.max(0, deadline - now())));
    }
    throw new Error(`Preview readiness timed out. The recorded process was not killed; inspect ${files.log} and run node scripts/realm-preview.mjs --status.`);
  } finally { await release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length > 1 || args.length === 1 && args[0] !== '--status') throw new Error('Usage: node scripts/realm-preview.mjs [--status]');
    const result = await runRealmPreview({ action: args[0] === '--status' ? 'status' : 'start' });
    console.log(JSON.stringify(result, null, 2));
    if (result.state !== 'ready') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
