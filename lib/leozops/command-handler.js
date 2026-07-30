// Sprints 1F-1J — session-authenticated command, runtime and job HTTP boundaries.

import crypto from 'node:crypto';
import { buildLeadBrief } from './brief-projector.js';
import { correlationIdOf, headerOf, pathOf } from './http.js';
import {
  LEOZOPS_COMMAND_MAX_BODY_BYTES,
  LeozOpsCommandError,
} from './command-contract.js';
import {
  confirmLeozOpsCommand,
  listLeozOpsCommands,
  prepareLeozOpsCommand,
  requireLeozOpsDirector,
} from './command-admin.js';
import { commandIntentAfterJob, runDueLeozOpsJobs } from './job-admin.js';
import { consumeLeozOpsQuota, readLeozOpsRuntime, updateLeozOpsRuntime } from './runtime-admin.js';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function responseError(error) {
  return error instanceof LeozOpsCommandError
    ? error
    : new LeozOpsCommandError('LeozOps command service is unavailable.', 500, 'leozops_command_unavailable');
}

async function readBoundedJson(req, maxBytes = LEOZOPS_COMMAND_MAX_BODY_BYTES) {
  const contentType = headerOf(req, 'content-type');
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;.*)?$/i.test(contentType.trim())) {
    throw new LeozOpsCommandError('Content-Type must be application/json.', 415, 'leozops_command_content_type_unsupported');
  }
  const declared = headerOf(req, 'content-length');
  if (declared !== null && (!/^\d+$/.test(declared.trim()) || Number(declared) > maxBytes)) {
    throw new LeozOpsCommandError('Command body is too large or invalid.', 413, 'leozops_command_body_too_large');
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new LeozOpsCommandError('Command body is too large.', 413, 'leozops_command_body_too_large');
  try { return JSON.parse(raw); }
  catch { throw new LeozOpsCommandError('Command body must be valid JSON.', 400, 'leozops_command_json_invalid'); }
}

function actorFingerprint(userId) {
  return userId ? crypto.createHash('sha256').update(`leozops-command:${userId}`).digest('hex').slice(0, 12) : null;
}

function commandAudit(log, event) {
  log(JSON.stringify({ evt: 'leozops_command_plane', ...event }));
}

function baseHeaders(correlationId, extra = {}) {
  return { 'X-Correlation-ID': correlationId, ...NO_STORE, ...extra };
}

async function authenticated(opts) {
  const user = await opts.getUser();
  requireLeozOpsDirector(user);
  return user;
}

export async function handleLeozOpsCommandInbox(req, opts = {}) {
  const {
    env = {}, db, getUser, loadLeads,
    now = () => Date.now(), uuid = () => crypto.randomUUID(),
    log = (...args) => console.log(...args),
  } = opts;
  if (env.LEOZOPS_COMMAND_ENABLED !== 'true') return { status: 404, headers: {}, body: { error: 'not found' } };
  const startedAt = now();
  const correlationId = correlationIdOf(req, uuid);
  const method = String(req.method || 'GET').toUpperCase();
  const requestPath = pathOf(req, '/api/leozops/command-intents');
  let user = null;
  try {
    if (!['GET', 'POST'].includes(method)) {
      return { status: 405, headers: baseHeaders(correlationId, { Allow: 'GET, POST' }), body: { error: 'method not allowed' } };
    }
    user = await authenticated({ getUser });
    const rateHeaders = await consumeLeozOpsQuota(db, user.id, {
      scope: method === 'GET' ? 'command_inbox' : 'command_prepare',
      limit: method === 'GET' ? 60 : 30,
      now: new Date(startedAt),
    });
    if (method === 'GET') {
      const body = await listLeozOpsCommands(db, user, { env, now: new Date(now()) });
      commandAudit(log, { correlation_id: correlationId, path: requestPath, method, status: 200, actor_fingerprint: actorFingerprint(user.id), latency_ms: now() - startedAt });
      return { status: 200, headers: baseHeaders(correlationId, rateHeaders), body };
    }
    const input = await readBoundedJson(req);
    const rawLeads = await loadLeads();
    const generatedAt = new Date(now()).toISOString();
    const currentBrief = buildLeadBrief(rawLeads, { generatedAt, asOf: generatedAt.slice(0, 10) });
    const body = await prepareLeozOpsCommand(db, user, input, {
      currentBrief,
      idempotencyKey: headerOf(req, 'idempotency-key'),
      correlationId,
      env,
      now: new Date(now()),
    });
    const status = body.intent.replayed ? 200 : 201;
    commandAudit(log, { correlation_id: correlationId, path: requestPath, method, status, actor_fingerprint: actorFingerprint(user.id), capability: body.intent.capability, intent_id: body.intent.id, latency_ms: now() - startedAt });
    return { status, headers: baseHeaders(correlationId, rateHeaders), body };
  } catch (caught) {
    const error = responseError(caught);
    commandAudit(log, { correlation_id: correlationId, path: requestPath, method, status: error.status, actor_fingerprint: actorFingerprint(user?.id), error_code: error.code, latency_ms: now() - startedAt });
    return { status: error.status, headers: baseHeaders(correlationId, error.headers), body: { error: error.message, code: error.code } };
  }
}

export async function handleLeozOpsCommandConfirmation(req, opts = {}) {
  const {
    env = {}, db, getUser, intentId,
    now = () => Date.now(), uuid = () => crypto.randomUUID(),
    log = (...args) => console.log(...args),
    runJobs = runDueLeozOpsJobs,
  } = opts;
  if (env.LEOZOPS_COMMAND_ENABLED !== 'true') return { status: 404, headers: {}, body: { error: 'not found' } };
  const startedAt = now();
  const correlationId = correlationIdOf(req, uuid);
  const method = String(req.method || 'POST').toUpperCase();
  const requestPath = pathOf(req, '/api/leozops/command-intents/:id/confirm');
  let user = null;
  try {
    if (method !== 'POST') return { status: 405, headers: baseHeaders(correlationId, { Allow: 'POST' }), body: { error: 'method not allowed' } };
    user = await authenticated({ getUser });
    const rateHeaders = await consumeLeozOpsQuota(db, user.id, { scope: 'command_confirm', limit: 20, now: new Date(startedAt) });
    const input = await readBoundedJson(req, 4 * 1024);
    if (input?.intent_id !== intentId) throw new LeozOpsCommandError('Route and body intent IDs differ.', 400, 'leozops_command_intent_mismatch');
    const confirmation = await confirmLeozOpsCommand(db, user, input, { env, now: new Date(now()) });
    if (!confirmation.replayed || confirmation.intent.status !== 'succeeded') {
      await runJobs(db, { env, now: new Date(now()), maxJobs: 10 });
    }
    const intent = await commandIntentAfterJob(db, intentId, new Date(now())) || confirmation.intent;
    const status = intent.status === 'succeeded' ? 200 : 202;
    commandAudit(log, { correlation_id: correlationId, path: requestPath, method, status, actor_fingerprint: actorFingerprint(user.id), intent_id: intentId, command_status: intent.status, latency_ms: now() - startedAt });
    return { status, headers: baseHeaders(correlationId, rateHeaders), body: { ...confirmation, intent } };
  } catch (caught) {
    const error = responseError(caught);
    commandAudit(log, { correlation_id: correlationId, path: requestPath, method, status: error.status, actor_fingerprint: actorFingerprint(user?.id), intent_id: intentId, error_code: error.code, latency_ms: now() - startedAt });
    return { status: error.status, headers: baseHeaders(correlationId, error.headers), body: { error: error.message, code: error.code } };
  }
}

export async function handleLeozOpsRuntime(req, opts = {}) {
  const {
    env = {}, db, getUser,
    now = () => Date.now(), uuid = () => crypto.randomUUID(),
  } = opts;
  if (env.LEOZOPS_COMMAND_ENABLED !== 'true') return { status: 404, headers: {}, body: { error: 'not found' } };
  const correlationId = correlationIdOf(req, uuid);
  const method = String(req.method || 'GET').toUpperCase();
  try {
    if (!['GET', 'POST'].includes(method)) return { status: 405, headers: baseHeaders(correlationId, { Allow: 'GET, POST' }), body: { error: 'method not allowed' } };
    const user = await authenticated({ getUser });
    const rateHeaders = await consumeLeozOpsQuota(db, user.id, { scope: 'runtime_control', limit: 30, now: new Date(now()) });
    const body = method === 'GET'
      ? await readLeozOpsRuntime(db, user, env)
      : await updateLeozOpsRuntime(db, user, await readBoundedJson(req, 4 * 1024), { env, now: new Date(now()) });
    return { status: 200, headers: baseHeaders(correlationId, rateHeaders), body };
  } catch (caught) {
    const error = responseError(caught);
    return { status: error.status, headers: baseHeaders(correlationId, error.headers), body: { error: error.message, code: error.code } };
  }
}

export async function handleLeozOpsManualJobRun(req, opts = {}) {
  const {
    env = {}, db, getUser,
    now = () => Date.now(), uuid = () => crypto.randomUUID(),
  } = opts;
  if (env.LEOZOPS_COMMAND_ENABLED !== 'true') return { status: 404, headers: {}, body: { error: 'not found' } };
  const correlationId = correlationIdOf(req, uuid);
  const method = String(req.method || 'POST').toUpperCase();
  try {
    if (method !== 'POST') return { status: 405, headers: baseHeaders(correlationId, { Allow: 'POST' }), body: { error: 'method not allowed' } };
    const user = await authenticated({ getUser });
    const rateHeaders = await consumeLeozOpsQuota(db, user.id, { scope: 'job_run', limit: 20, now: new Date(now()) });
    const body = await runDueLeozOpsJobs(db, { env, now: new Date(now()), maxJobs: 10 });
    return { status: 200, headers: baseHeaders(correlationId, rateHeaders), body };
  } catch (caught) {
    const error = responseError(caught);
    return { status: error.status, headers: baseHeaders(correlationId, error.headers), body: { error: error.message, code: error.code } };
  }
}
