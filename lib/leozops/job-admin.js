// Sprints 1I-1J — durable execution, receipt reconciliation and bounded retry.

import crypto from 'node:crypto';
import { executeRepositoryRealmsAction } from '../repository-realms.js';
import { RealmOperationError } from '../realm-operation.js';
import { capabilityById, LeozOpsCommandError } from './command-contract.js';
import { projectCommandIntent, repositoryInputForIntent } from './command-admin.js';
import {
  assertLeozOpsExecutionAvailable,
  consumeLeozOpsActionBudget,
  recordLeozOpsRuntimeFailure,
  recordLeozOpsRuntimeSuccess,
} from './runtime-admin.js';

const LEASE_MS = 60_000;

function errorCode(error) {
  const code = String(error?.code || 'leozops_command_execution_failed').trim();
  return /^[a-z0-9_]{3,100}$/.test(code) ? code : 'leozops_command_execution_failed';
}

function retryDelay(attempt) {
  return Math.min(16 * 60_000, (2 ** Math.max(0, attempt - 1)) * 60_000);
}

async function appendIntentState(db, intent, {
  status,
  actorId = null,
  reasonCode = null,
  receiptId = null,
  now = new Date(),
  extra = {},
}) {
  return db.$transaction(async tx => {
    const changed = await tx.leozOpsCommandIntent.updateMany({
      where: { id: intent.id, workVersion: intent.workVersion },
      data: { status, workVersion: { increment: 1 }, ...extra },
    });
    if (changed.count !== 1) return tx.leozOpsCommandIntent.findUnique({ where: { id: intent.id } });
    await tx.leozOpsCommandEvent.create({ data: {
      intentId: intent.id,
      sequence: intent.workVersion + 1,
      status,
      actorId,
      reasonCode,
      receiptId,
      createdAt: now,
    } });
    return tx.leozOpsCommandIntent.findUnique({ where: { id: intent.id } });
  }, { isolationLevel: 'Serializable' });
}

async function markJob(db, job, data) {
  await db.leozOpsCommandJob.updateMany({ where: { id: job.id, lockToken: job.lockToken }, data });
}

async function canonicalReceipt(db, intent) {
  const receipt = await db.realmActionReceipt.findUnique({ where: { idempotencyKey: intent.repositoryIdempotencyKey } });
  if (!receipt) return null;
  const input = repositoryInputForIntent(intent);
  let change;
  let fromState;
  let toState;
  let resource;
  let resultRequired = false;
  if (intent.capability === 'lead.followup.create') {
    change = { kind: input.kind, title: input.title, date: input.date };
    fromState = 'none'; toState = 'created'; resource = 'activities'; resultRequired = true;
  } else if (intent.capability === 'lead.expected_close.update') {
    change = { expectedCloseAt: input.expectedCloseAt ?? null, closeAt: input.closeAt ?? null };
    fromState = change.expectedCloseAt || 'none'; toState = change.closeAt || 'none'; resource = 'leads';
  } else if (intent.capability === 'lead.source.update') {
    change = { expectedSource: input.expectedSource ?? null, source: input.source ?? null };
    fromState = change.expectedSource || 'none'; toState = change.source || 'none'; resource = 'leads';
  } else {
    change = { expectedState: input.expectedState, nextState: input.nextState };
    fromState = input.expectedState; toState = input.nextState; resource = 'leads';
  }
  const expectedPayloadHash = crypto.createHash('sha256').update(JSON.stringify(change)).digest('hex');
  if (receipt.userId !== intent.confirmedById
    || receipt.action !== intent.capability
    || receipt.resource !== resource
    || receipt.entityId !== intent.targetRef
    || receipt.fromState !== fromState
    || receipt.toState !== toState
    || receipt.payloadHash !== expectedPayloadHash
    || (resultRequired && !receipt.resultId)) {
    throw new LeozOpsCommandError('Repository receipt does not match command intent.', 409, 'leozops_command_receipt_conflict');
  }
  return receipt;
}

async function markSucceeded(db, job, intent, receipt, now, replayed) {
  const current = intent.status === 'succeeded' ? intent : await appendIntentState(db, intent, {
    status: 'succeeded',
    actorId: intent.confirmedById,
    reasonCode: replayed ? 'repository_receipt_reconciled' : 'repository_execution_succeeded',
    receiptId: receipt.id,
    now,
    extra: { repositoryReceiptId: receipt.id, lastErrorCode: null },
  });
  await markJob(db, job, {
    status: 'succeeded', lockToken: null, lockedAt: null, lastErrorCode: null,
  });
  await recordLeozOpsRuntimeSuccess(db);
  return { intent: current, receipt, replayed };
}

async function terminalFailure(db, job, intent, error, now) {
  const code = errorCode(error);
  const status = job.attemptCount >= job.maxAttempts ? 'dead_letter' : 'failed';
  const current = await appendIntentState(db, intent, {
    status,
    actorId: intent.confirmedById,
    reasonCode: code,
    now,
    extra: { lastErrorCode: code },
  });
  await markJob(db, job, {
    status, lockToken: null, lockedAt: null, lastErrorCode: code,
  });
  if (db.notification?.create && intent.confirmedById) {
    await db.notification.create({ data: {
      userId: intent.confirmedById,
      text: `LeoZOps cần bạn xử lý command ${intent.id}: ${code}`,
      route: '/approvals',
      createdAt: now,
    } }).catch(() => {});
  }
  return { intent: current, error: code, terminal: true };
}

async function retryFailure(db, job, intent, error, now, { recordCircuit = true } = {}) {
  const code = errorCode(error);
  const exhausted = job.attemptCount >= job.maxAttempts;
  if (exhausted) return terminalFailure(db, job, intent, error, now);
  const current = await appendIntentState(db, intent, {
    status: 'pending_reconciliation',
    actorId: intent.confirmedById,
    reasonCode: code,
    now,
    extra: { lastErrorCode: code },
  });
  await markJob(db, job, {
    status: 'retry',
    runAt: new Date(now.getTime() + retryDelay(job.attemptCount)),
    lockToken: null,
    lockedAt: null,
    lastErrorCode: code,
  });
  if (recordCircuit) await recordLeozOpsRuntimeFailure(db, now);
  return { intent: current, error: code, terminal: false };
}

function terminalError(error) {
  const retryableControlCodes = new Set([
    'leozops_command_capability_disabled',
    'leozops_runtime_circuit_open',
    'leozops_runtime_deployment_disabled',
    'leozops_runtime_kill_switch',
    'leozops_runtime_stale',
  ]);
  return (error instanceof RealmOperationError && error.status < 500)
    || (error instanceof LeozOpsCommandError && error.status < 500 && !retryableControlCodes.has(error.code));
}

function runtimeControlPause(error) {
  return error instanceof LeozOpsCommandError && [
    'leozops_command_capability_disabled',
    'leozops_runtime_circuit_open',
    'leozops_runtime_deployment_disabled',
    'leozops_runtime_kill_switch',
    'leozops_runtime_stale',
  ].includes(error.code);
}

export async function executeLeozOpsJob(db, claimedJob, {
  env = {},
  now = new Date(),
  executor = executeRepositoryRealmsAction,
} = {}) {
  let intent = await db.leozOpsCommandIntent.findUnique({ where: { id: claimedJob.intentId } });
  if (!intent) {
    await markJob(db, claimedJob, {
      status: 'dead_letter', lockToken: null, lockedAt: null, lastErrorCode: 'leozops_command_intent_missing',
    });
    return { intent: null, error: 'leozops_command_intent_missing', terminal: true };
  }
  try {
    const existing = await canonicalReceipt(db, intent);
    if (existing) return markSucceeded(db, claimedJob, intent, existing, now, true);
    if (!['confirmed', 'executing', 'pending_reconciliation'].includes(intent.status)) {
      throw new LeozOpsCommandError('Command state cannot be executed.', 409, 'leozops_command_state_conflict');
    }
    const capability = capabilityById(intent.capability);
    if (!capability) throw new LeozOpsCommandError('Capability is not registered.', 409, 'leozops_command_capability_unsupported');
    const runtime = await assertLeozOpsExecutionAvailable(db, capability, { env, now });
    await consumeLeozOpsActionBudget(db, intent, runtime, now);
    if (intent.status !== 'executing') {
      intent = await appendIntentState(db, intent, {
        status: 'executing', actorId: intent.confirmedById, reasonCode: 'repository_dispatch_started', now,
        extra: { lastErrorCode: null },
      });
    }
    const user = await db.user.findUnique({
      where: { id: intent.confirmedById },
      select: { id: true, name: true, role: true, roles: true, teamId: true, userType: true, status: true },
    });
    if (!user || user.status !== 'active') throw new LeozOpsCommandError('Confirmed operator is unavailable.', 403, 'leozops_command_operator_unavailable');
    const result = await executor(db, user, repositoryInputForIntent(intent));
    const receipt = await canonicalReceipt(db, intent);
    if (!receipt?.id || receipt.id !== (result.repository?.receiptId || result.action?.id)) {
      throw new LeozOpsCommandError('Canonical receipt is missing or differs from RepositoryRealms.', 500, 'leozops_command_receipt_missing');
    }
    return markSucceeded(db, claimedJob, intent, receipt, now, result.idempotent === true);
  } catch (error) {
    return terminalError(error)
      ? terminalFailure(db, claimedJob, intent, error, now)
      : retryFailure(db, claimedJob, intent, error, now, { recordCircuit: !runtimeControlPause(error) });
  }
}

async function claimJobs(db, {
  now,
  maxJobs,
  uuid,
}) {
  const leaseExpiredAt = new Date(now.getTime() - LEASE_MS);
  const candidates = await db.leozOpsCommandJob.findMany({
    where: {
      status: { in: ['pending', 'retry', 'running'] },
      runAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: leaseExpiredAt } }],
    },
    orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
    take: maxJobs,
  });
  const claimed = [];
  for (const job of candidates) {
    const lockToken = uuid();
    const result = await db.leozOpsCommandJob.updateMany({
      where: {
        id: job.id,
        status: job.status,
        OR: [{ lockedAt: null }, { lockedAt: { lt: leaseExpiredAt } }],
      },
      data: {
        status: 'running', lockToken, lockedAt: now,
        attemptCount: { increment: 1 },
      },
    });
    if (result.count === 1) claimed.push({ ...job, status: 'running', lockToken, lockedAt: now, attemptCount: job.attemptCount + 1 });
  }
  return claimed;
}

export async function runDueLeozOpsJobs(db, {
  env = {},
  now = new Date(),
  maxJobs = 10,
  uuid = () => crypto.randomUUID(),
  executor = executeRepositoryRealmsAction,
} = {}) {
  const take = Math.max(1, Math.min(Number(maxJobs) || 10, 25));
  const jobs = await claimJobs(db, { now, maxJobs: take, uuid });
  const results = [];
  for (const job of jobs) results.push(await executeLeozOpsJob(db, job, { env, now, executor }));
  return {
    contract: 'leozops.job-run',
    version: 1,
    claimed: jobs.length,
    succeeded: results.filter(result => result.receipt).length,
    retrying: results.filter(result => result.error && !result.terminal).length,
    failed: results.filter(result => result.error && result.terminal).length,
    intent_ids: results.map(result => result.intent?.id).filter(Boolean),
  };
}

export async function commandIntentAfterJob(db, intentId, now = new Date()) {
  const [intent, events] = await Promise.all([
    db.leozOpsCommandIntent.findUnique({ where: { id: intentId } }),
    db.leozOpsCommandEvent.findMany({ where: { intentId }, orderBy: { sequence: 'asc' } }),
  ]);
  return intent ? projectCommandIntent(intent, { events, now }) : null;
}
