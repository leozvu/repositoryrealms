// Sprint 1J — durable runtime gate, shared quotas and circuit state.

import crypto from 'node:crypto';
import { isDirector } from '../perm.js';
import {
  LEOZOPS_RUNTIME_ID,
  LeozOpsCommandError,
  capabilityProjection,
  normalizeRuntimeCommand,
  projectRuntime,
} from './command-contract.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 15 * 60_000;

function fail(message, status, code, headers) {
  throw new LeozOpsCommandError(message, status, code, headers);
}

function requireDirector(user) {
  if (!user?.id) fail('Authentication is required.', 401, 'leozops_command_unauthorized');
  if (!isDirector(user)) fail('Director scope is required.', 403, 'leozops_command_director_required');
}

function bucketStart(now, windowMs) {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function bucketKey(scope, subjectHash, startedAt) {
  return crypto.createHash('sha256').update(`${scope}:${subjectHash}:${startedAt.toISOString()}`).digest('hex');
}

export async function consumeLeozOpsQuota(db, subject, {
  scope = 'command_api',
  limit = 60,
  windowMs = HOUR_MS,
  now = new Date(),
} = {}) {
  const subjectHash = crypto.createHash('sha256').update(`leozops-quota:${subject}`).digest('hex');
  const windowStartedAt = bucketStart(now, windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + (windowMs * 2));
  const key = bucketKey(scope, subjectHash, windowStartedAt);
  const bucket = await db.leozOpsQuotaBucket.upsert({
    where: { bucketKey: key },
    create: { bucketKey: key, scope, subjectHash, windowStartedAt, expiresAt, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });
  const resetSeconds = Math.max(1, Math.ceil((windowStartedAt.getTime() + windowMs - now.getTime()) / 1000));
  db.leozOpsQuotaBucket.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
  if (bucket.requestCount > limit) {
    fail('LeozOps shared quota exceeded.', 429, 'leozops_command_rate_limited', {
      'Retry-After': String(resetSeconds),
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': '0',
    });
  }
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, limit - bucket.requestCount)),
    'X-RateLimit-Reset': String(resetSeconds),
  };
}

export async function readLeozOpsRuntime(db, user, env = {}) {
  requireDirector(user);
  const row = await db.leozOpsRuntimeControl.findUnique({ where: { id: LEOZOPS_RUNTIME_ID } });
  return { contract: 'leozops.runtime-state', version: 1, runtime: projectRuntime(row, env) };
}

export async function updateLeozOpsRuntime(db, user, input, {
  env = {},
  now = new Date(),
} = {}) {
  requireDirector(user);
  const command = normalizeRuntimeCommand(input);
  if (command.action === 'activate' && env.LEOZOPS_EXECUTION_ENABLED !== 'true') {
    fail('Deployment execution flag is disabled.', 409, 'leozops_runtime_deployment_disabled');
  }
  const result = await db.$transaction(async tx => {
    const current = await tx.leozOpsRuntimeControl.findUnique({ where: { id: LEOZOPS_RUNTIME_ID } });
    const version = current?.recordVersion || 0;
    if (version !== command.expectedVersion) fail('Runtime control changed. Reload before retrying.', 409, 'leozops_runtime_stale');
    const common = {
      dailyActionLimit: command.dailyActionLimit || current?.dailyActionLimit || 5,
      updatedById: user.id,
      recordVersion: version + 1,
    };
    let data;
    if (command.action === 'kill') {
      data = { ...common, executionEnabled: false, killSwitchActive: true };
    } else if (command.action === 'activate') {
      data = { ...common, executionEnabled: true, killSwitchActive: false };
    } else {
      data = {
        ...common,
        executionEnabled: current?.executionEnabled || false,
        killSwitchActive: current?.killSwitchActive ?? true,
        circuitState: 'closed',
        consecutiveFailures: 0,
        circuitOpenedAt: null,
        circuitRetryAt: null,
      };
    }
    const row = current
      ? await tx.leozOpsRuntimeControl.update({ where: { id: LEOZOPS_RUNTIME_ID }, data })
      : await tx.leozOpsRuntimeControl.create({ data: { id: LEOZOPS_RUNTIME_ID, ...data } });
    await tx.auditLog.create({ data: {
      userId: user.id,
      userName: user.name || 'Director',
      action: `leozops_runtime_${command.action}`,
      entity: 'leozops_runtime_control',
      refId: LEOZOPS_RUNTIME_ID,
      detail: `version=${row.recordVersion}; execution=${row.executionEnabled}; kill_switch=${row.killSwitchActive}; limit=${row.dailyActionLimit}`,
      at: now,
    } });
    return row;
  }, { isolationLevel: 'Serializable' });
  return { contract: 'leozops.runtime-state', version: 1, runtime: projectRuntime(result, env) };
}

export async function assertLeozOpsExecutionAvailable(db, capability, {
  env = {},
  now = new Date(),
} = {}) {
  const projectedCapability = capabilityProjection(capability, env);
  if (!projectedCapability.enabled) fail('Capability deployment flag is disabled.', 409, 'leozops_command_capability_disabled');
  if (env.LEOZOPS_EXECUTION_ENABLED !== 'true') fail('Execution deployment flag is disabled.', 409, 'leozops_runtime_deployment_disabled');
  let row = await db.leozOpsRuntimeControl.findUnique({ where: { id: LEOZOPS_RUNTIME_ID } });
  if (!row || !row.executionEnabled || row.killSwitchActive) fail('LeozOps execution is stopped by runtime control.', 409, 'leozops_runtime_kill_switch');
  if (row.circuitState === 'open') {
    const retryAt = row.circuitRetryAt ? new Date(row.circuitRetryAt) : null;
    if (!retryAt || retryAt > now) {
      fail('LeozOps execution circuit is open.', 503, 'leozops_runtime_circuit_open', retryAt ? {
        'Retry-After': String(Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000))),
      } : {});
    }
    const changed = await db.leozOpsRuntimeControl.updateMany({
      where: { id: LEOZOPS_RUNTIME_ID, recordVersion: row.recordVersion, circuitState: 'open' },
      data: { circuitState: 'half_open', recordVersion: { increment: 1 } },
    });
    if (changed.count !== 1) fail('Runtime control changed. Retry later.', 409, 'leozops_runtime_stale');
    row = { ...row, circuitState: 'half_open', recordVersion: row.recordVersion + 1 };
  }
  return row;
}

export async function consumeLeozOpsActionBudget(db, intent, runtime, now = new Date()) {
  if (intent.budgetConsumedAt) return false;
  const scope = 'daily_action_budget';
  const limit = Number(runtime.dailyActionLimit);
  if (!Number.isInteger(limit) || limit < 1) fail('LeozOps daily action budget is unavailable.', 409, 'leozops_runtime_budget_unavailable');
  const subjectHash = crypto.createHash('sha256').update('leozops-quota:global-action-budget').digest('hex');
  const windowStartedAt = bucketStart(now, DAY_MS);
  const expiresAt = new Date(windowStartedAt.getTime() + (DAY_MS * 2));
  const key = bucketKey(scope, subjectHash, windowStartedAt);
  let consumed = false;
  await db.$transaction(async tx => {
    const updated = await tx.leozOpsCommandIntent.updateMany({
      where: { id: intent.id, budgetConsumedAt: null },
      data: { budgetConsumedAt: now },
    });
    if (updated.count !== 1) return;
    const bucket = await tx.leozOpsQuotaBucket.upsert({
      where: { bucketKey: key },
      create: { bucketKey: key, scope, subjectHash, windowStartedAt, expiresAt, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
    });
    if (bucket.requestCount > limit) {
      const resetSeconds = Math.max(1, Math.ceil((windowStartedAt.getTime() + DAY_MS - now.getTime()) / 1000));
      fail('LeozOps daily action budget exceeded.', 429, 'leozops_runtime_budget_exceeded', {
        'Retry-After': String(resetSeconds),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      });
    }
    consumed = true;
  }, { isolationLevel: 'Serializable' });
  db.leozOpsQuotaBucket.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
  return consumed;
}

export async function recordLeozOpsRuntimeSuccess(db) {
  await db.leozOpsRuntimeControl.updateMany({
    where: { id: LEOZOPS_RUNTIME_ID },
    data: {
      circuitState: 'closed', consecutiveFailures: 0, circuitOpenedAt: null, circuitRetryAt: null,
      recordVersion: { increment: 1 },
    },
  });
}

export async function recordLeozOpsRuntimeFailure(db, now = new Date()) {
  const row = await db.leozOpsRuntimeControl.findUnique({ where: { id: LEOZOPS_RUNTIME_ID } });
  if (!row) return;
  const failures = row.consecutiveFailures + 1;
  const open = failures >= CIRCUIT_THRESHOLD;
  await db.leozOpsRuntimeControl.updateMany({
    where: { id: LEOZOPS_RUNTIME_ID, recordVersion: row.recordVersion },
    data: {
      consecutiveFailures: failures,
      circuitState: open ? 'open' : row.circuitState,
      circuitOpenedAt: open ? now : row.circuitOpenedAt,
      circuitRetryAt: open ? new Date(now.getTime() + CIRCUIT_COOLDOWN_MS) : row.circuitRetryAt,
      recordVersion: { increment: 1 },
    },
  });
}
