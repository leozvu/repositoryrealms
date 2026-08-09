import { isDirector } from './perm.js';
import { RESOURCES, canWrite } from './registry.js';
import {
  LEOZOPS_TASK_APPROVAL_RECEIPT_CONTRACT,
  LEOZOPS_TASK_APPROVAL_TTL_MS,
  LEOZOPS_TASK_COMMAND_CONTRACT,
  LEOZOPS_TASK_COMMAND_KEY,
  LEOZOPS_TASK_COMMAND_RECEIPT_CONTRACT,
  LEOZOPS_TASK_COMMAND_VERSION,
  LeozOpsTaskCommandError,
  hashLeozOpsTaskValue,
  leozOpsTaskPreviewEvidence,
  leozOpsTaskRequestFingerprint,
  normalizeLeozOpsTaskCommand,
} from './leozops-task-command.js';

const TASK_SELECT = Object.freeze({
  id: true,
  title: true,
  projectId: true,
  assigneeId: true,
  priority: true,
  status: true,
  dueDate: true,
  note: true,
  dependsOn: true,
  checklist: true,
  recur: true,
  estHours: true,
  phaseId: true,
  labels: true,
  statusSince: true,
  queuePosition: true,
  workVersion: true,
  workType: true,
  complexity: true,
  blockReason: true,
  blockedAt: true,
  waitingReason: true,
  escalationLevel: true,
  escalatedAt: true,
  parentTaskId: true,
  mergedIntoTaskId: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

function requireDirector(user) {
  if (!user) throw new LeozOpsTaskCommandError('Authentication required.', 401, 'leozops_task_unauthorized');
  if (!isDirector(user)) {
    throw new LeozOpsTaskCommandError('Director service role required.', 403, 'leozops_task_director_required');
  }
}

function requireBoundary(command, user, context) {
  requireDirector(user);
  if (command.targetEntityId !== context.entityId) {
    throw new LeozOpsTaskCommandError('Command audience does not match this entity.', 403, 'leozops_task_audience_mismatch');
  }
  if (!context.enabledCapabilities?.includes('delivery')) {
    throw new LeozOpsTaskCommandError('Task delivery capability is unavailable.', 422, 'leozops_task_capability_unavailable');
  }
  if (!context.credentialId) {
    throw new LeozOpsTaskCommandError('Bound service credential evidence is missing.', 403, 'leozops_task_credential_missing');
  }
}

async function prepareTaskDraft(db, user, payload) {
  if (!canWrite('tasks', user)) {
    throw new LeozOpsTaskCommandError('Task write is not authorized.', 403, 'leozops_task_write_forbidden');
  }
  const draft = {
    title: payload.title,
    note: payload.note,
    assigneeId: null,
    projectId: null,
    priority: payload.priority,
    dueDate: payload.dueDate,
    estHours: payload.estHours,
    status: 'todo',
  };
  const data = RESOURCES.tasks.beforeCreate
    ? await RESOURCES.tasks.beforeCreate(draft, user, db)
    : draft;
  if (data.assigneeId !== null || data.projectId !== null || data.status !== 'todo') {
    throw new LeozOpsTaskCommandError('Task boundary expanded outside the approved profile.', 422, 'leozops_task_profile_violation');
  }
  if (RESOURCES.tasks.validate) {
    const validation = await RESOURCES.tasks.validate(null, data, db);
    if (validation) throw new LeozOpsTaskCommandError(validation, 422, 'leozops_task_rule_failed');
  }
  return data;
}

function normalizedDate(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

export function leozOpsTaskStateFingerprint(row) {
  if (!row) return null;
  const snapshot = {};
  for (const key of Object.keys(TASK_SELECT)) snapshot[key] = normalizedDate(row[key]);
  return hashLeozOpsTaskValue(snapshot);
}

function repositoryEvidence(receiptId, mode = 'receipt') {
  return {
    name: 'RepositoryRealms',
    receiptId,
    invariants: {
      authorization: 'enforced',
      businessRules: 'enforced',
      receipt: mode === 'preview' ? 'not_persisted_by_design' : 'verified',
      audit: mode === 'preview' ? 'not_written_by_design' : 'atomic',
      previewBusinessMutationCount: 0,
      approvalSeparation: 'credential_and_subject',
    },
  };
}

function approvalEnvelope(row, replayed = false) {
  return {
    contract: LEOZOPS_TASK_APPROVAL_RECEIPT_CONTRACT,
    version: LEOZOPS_TASK_COMMAND_VERSION,
    approval: {
      id: row.id,
      kind: row.kind,
      targetEntityId: row.targetEntityId,
      approvedBySubject: row.approvedBySubject,
      requestFingerprint: row.requestFingerprint,
      previewFingerprint: row.previewFingerprint,
      subjectCommandId: row.subjectCommandId || null,
      approvedAt: new Date(row.approvedAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      consumed: Boolean(row.consumedAt),
      replayed,
    },
    repository: repositoryEvidence(row.id),
  };
}

function commandReceiptEnvelope(row, operation, replayed = false) {
  const rollback = operation === 'rollback';
  const correlationId = rollback ? row.rollbackCorrelationId : row.correlationId;
  const resultFingerprint = rollback ? row.rollbackResultFingerprint : row.executionResultFingerprint;
  return {
    contract: LEOZOPS_TASK_COMMAND_RECEIPT_CONTRACT,
    version: LEOZOPS_TASK_COMMAND_VERSION,
    receipt: {
      id: rollback ? row.rollbackReceiptId : row.id,
      commandId: row.id,
      commandKey: LEOZOPS_TASK_COMMAND_KEY,
      operation,
      targetEntityId: row.targetEntityId,
      actorSubject: rollback ? row.rollbackActorSubject : row.actorSubject,
      correlationId,
      resource: 'tasks',
      recordId: row.taskId,
      requestFingerprint: rollback ? row.rollbackRequestFingerprint : row.requestFingerprint,
      resultFingerprint,
      resultCode: rollback ? 'task_create_rolled_back' : 'task_created',
      externalMutationCount: 1,
      committedAt: new Date(rollback ? row.rolledBackAt : row.createdAt).toISOString(),
      replayed,
    },
    state: row.status,
    repository: repositoryEvidence(rollback ? row.rollbackReceiptId : row.id),
  };
}

function assertApprovalMatches(approval, command, preview, context, kind, now) {
  if (!approval || approval.kind !== kind) {
    throw new LeozOpsTaskCommandError('Approval was not found.', 404, 'leozops_task_approval_not_found');
  }
  if (
    approval.targetEntityId !== command.targetEntityId
    || approval.requestFingerprint !== preview.requestFingerprint
    || approval.previewFingerprint !== preview.previewFingerprint
    || (kind === 'execute' ? approval.subjectCommandId !== null : approval.subjectCommandId !== command.commandId)
  ) {
    throw new LeozOpsTaskCommandError('Approval binding is invalid.', 409, 'leozops_task_approval_binding_mismatch');
  }
  if (approval.consumedAt || new Date(approval.expiresAt) <= now) {
    throw new LeozOpsTaskCommandError('Approval is consumed or expired.', 409, 'leozops_task_approval_unavailable');
  }
  if (
    approval.approvalCredentialId === context.credentialId
    || approval.approvedBySubject === command.actorSubject
  ) {
    throw new LeozOpsTaskCommandError('Approver and operator must be separate.', 403, 'leozops_task_approval_separation_required');
  }
}

async function previewCreate(db, user, command, now, context) {
  requireBoundary(command, user, context);
  await prepareTaskDraft(db, user, command.payload);
  return {
    contract: LEOZOPS_TASK_COMMAND_CONTRACT,
    version: LEOZOPS_TASK_COMMAND_VERSION,
    operation: 'preview',
    commandKey: LEOZOPS_TASK_COMMAND_KEY,
    preview: leozOpsTaskPreviewEvidence(command, { now }),
    repository: repositoryEvidence(command.correlationId, 'preview'),
  };
}

async function approve(db, user, command, now, context, kind) {
  requireBoundary(command, user, context);
  const preview = kind === 'execute'
    ? (await previewCreate(db, user, { ...command, operation: 'preview' }, now, context)).preview
    : await previewRollback(db, user, { ...command, operation: 'preview_rollback' }, now, context).then((result) => result.preview);
  if (command.previewFingerprint !== preview.previewFingerprint) {
    throw new LeozOpsTaskCommandError('Preview fingerprint is stale or invalid.', 409, 'leozops_task_preview_mismatch');
  }
  const existing = await db.leozOpsTaskCommandApproval.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
  if (existing) {
    const same = existing.kind === kind
      && existing.correlationId === command.correlationId
      && existing.targetEntityId === command.targetEntityId
      && existing.approvedBySubject === command.actorSubject
      && existing.approvalCredentialId === context.credentialId
      && existing.requestFingerprint === preview.requestFingerprint
      && existing.previewFingerprint === preview.previewFingerprint
      && (existing.subjectCommandId || null) === (command.commandId || null);
    if (!same) throw new LeozOpsTaskCommandError('Approval idempotency conflict.', 409, 'leozops_task_idempotency_conflict');
    return approvalEnvelope(existing, true);
  }
  const row = await db.$transaction(async (tx) => {
    const raced = await tx.leozOpsTaskCommandApproval.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
    if (raced) {
      const same = raced.kind === kind
        && raced.correlationId === command.correlationId
        && raced.targetEntityId === command.targetEntityId
        && raced.approvedBySubject === command.actorSubject
        && raced.approvalCredentialId === context.credentialId
        && raced.requestFingerprint === preview.requestFingerprint
        && raced.previewFingerprint === preview.previewFingerprint
        && (raced.subjectCommandId || null) === (command.commandId || null);
      if (!same) throw new LeozOpsTaskCommandError('Approval idempotency conflict.', 409, 'leozops_task_idempotency_conflict');
      return raced;
    }
    const created = await tx.leozOpsTaskCommandApproval.create({
      data: {
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
        kind,
        targetEntityId: command.targetEntityId,
        approvedBySubject: command.actorSubject,
        requestFingerprint: preview.requestFingerprint,
        previewFingerprint: preview.previewFingerprint,
        subjectCommandId: command.commandId || null,
        approvalCredentialId: context.credentialId,
        approvedAt: now,
        expiresAt: new Date(now.getTime() + LEOZOPS_TASK_APPROVAL_TTL_MS),
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: `leozops_task_${kind}_approved`,
        entity: 'tasks',
        refId: command.commandId || created.id,
        detail: `approval=${created.id}; correlation=${command.correlationId}; preview=${preview.previewFingerprint}`,
      },
    });
    return created;
  }, { isolationLevel: 'Serializable' });
  return approvalEnvelope(row, false);
}

async function execute(db, user, command, now, context) {
  requireBoundary(command, user, context);
  const data = await prepareTaskDraft(db, user, command.payload);
  const preview = leozOpsTaskPreviewEvidence(command, { now });
  const requestFingerprint = leozOpsTaskRequestFingerprint(command);
  const existing = await db.leozOpsTaskCommand.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
  if (existing) {
    if (
      existing.correlationId !== command.correlationId
      || existing.targetEntityId !== command.targetEntityId
      || existing.actorSubject !== command.actorSubject
      || existing.requestFingerprint !== requestFingerprint
      || existing.approvalId !== command.approvalId
      || existing.executionCredentialId !== context.credentialId
    ) throw new LeozOpsTaskCommandError('Execution idempotency conflict.', 409, 'leozops_task_idempotency_conflict');
    return commandReceiptEnvelope(existing, 'execute', true);
  }
  const committed = await db.$transaction(async (tx) => {
    const raced = await tx.leozOpsTaskCommand.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
    if (raced) {
      if (
        raced.correlationId !== command.correlationId
        || raced.targetEntityId !== command.targetEntityId
        || raced.actorSubject !== command.actorSubject
        || raced.requestFingerprint !== requestFingerprint
        || raced.approvalId !== command.approvalId
        || raced.executionCredentialId !== context.credentialId
      ) throw new LeozOpsTaskCommandError('Execution idempotency conflict.', 409, 'leozops_task_idempotency_conflict');
      return { row: raced, replayed: true };
    }
    const approval = await tx.leozOpsTaskCommandApproval.findUnique({ where: { id: command.approvalId } });
    assertApprovalMatches(approval, command, preview, context, 'execute', now);
    const task = await tx.task.create({ data, select: TASK_SELECT });
    const taskStateFingerprint = leozOpsTaskStateFingerprint(task);
    const executionResultFingerprint = hashLeozOpsTaskValue({
      commandKey: LEOZOPS_TASK_COMMAND_KEY,
      requestFingerprint,
      taskId: task.id,
      taskStateFingerprint,
    });
    const row = await tx.leozOpsTaskCommand.create({
      data: {
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
        targetEntityId: command.targetEntityId,
        actorSubject: command.actorSubject,
        requestFingerprint,
        previewFingerprint: preview.previewFingerprint,
        approvalId: approval.id,
        taskId: task.id,
        taskStateFingerprint,
        executionResultFingerprint,
        executionCredentialId: context.credentialId,
        status: 'active',
        createdAt: now,
      },
    });
    await tx.leozOpsTaskCommandApproval.update({
      where: { id: approval.id },
      data: { consumedAt: now, consumedByCommandId: row.id },
    });
    await tx.realmChangeEvent.create({
      data: { resource: 'tasks', action: 'create', entityId: task.id, actorId: user.id, domains: '["tasks"]', createdAt: now },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: 'leozops_task_create',
        entity: 'tasks',
        refId: task.id,
        detail: `command=${row.id}; correlation=${command.correlationId}; approval=${approval.id}`,
      },
    });
    return { row, replayed: false };
  }, { isolationLevel: 'Serializable' });
  return commandReceiptEnvelope(committed.row, 'execute', committed.replayed);
}

async function taskRollbackBlockers(db, taskId) {
  const counts = await Promise.all([
    db.taskEvent.count({ where: { taskId } }),
    db.taskComment.count({ where: { taskId } }),
    db.timeLog.count({ where: { taskId } }),
    db.workItemEvent.count({ where: { taskId } }),
    db.workEstimateRevision.count({ where: { taskId } }),
    db.realmQuestConfig.count({ where: { taskId } }),
    db.task.count({ where: { OR: [{ parentTaskId: taskId }, { mergedIntoTaskId: taskId }, { dependsOn: { contains: taskId } }] } }),
    db.realmGoldEntry.count({ where: { sourceId: taskId } }),
  ]);
  return counts.reduce((sum, value) => sum + Number(value || 0), 0);
}

async function loadRollbackSubject(db, command, context) {
  const source = await db.leozOpsTaskCommand.findUnique({ where: { id: command.commandId } });
  if (!source || source.targetEntityId !== command.targetEntityId) {
    throw new LeozOpsTaskCommandError('Task command was not found.', 404, 'leozops_task_command_not_found');
  }
  if (source.status !== 'active') {
    throw new LeozOpsTaskCommandError('Task command is not rollback-eligible.', 409, 'leozops_task_rollback_unavailable');
  }
  const task = await db.task.findUnique({ where: { id: source.taskId }, select: TASK_SELECT });
  const linkedRecords = task ? await taskRollbackBlockers(db, source.taskId) : 0;
  if (!task || leozOpsTaskStateFingerprint(task) !== source.taskStateFingerprint || linkedRecords !== 0) {
    throw new LeozOpsTaskCommandError('Task changed after execution and cannot be rolled back automatically.', 409, 'leozops_task_rollback_state_changed');
  }
  return { source, task };
}

async function previewRollback(db, user, command, now, context) {
  requireBoundary(command, user, context);
  const { source, task } = await loadRollbackSubject(db, command, context);
  return {
    contract: LEOZOPS_TASK_COMMAND_CONTRACT,
    version: LEOZOPS_TASK_COMMAND_VERSION,
    operation: 'preview_rollback',
    commandKey: LEOZOPS_TASK_COMMAND_KEY,
    preview: leozOpsTaskPreviewEvidence(command, {
      taskStateFingerprint: leozOpsTaskStateFingerprint(task),
      now,
    }),
    subject: { commandId: source.id, executionResultFingerprint: source.executionResultFingerprint },
    repository: repositoryEvidence(command.correlationId, 'preview'),
  };
}

async function rollback(db, user, command, now, context) {
  requireBoundary(command, user, context);
  const existing = await db.leozOpsTaskCommand.findUnique({ where: { id: command.commandId } });
  if (
    existing?.status === 'rolled_back'
    && existing.rollbackIdempotencyKey === command.idempotencyKey
    && existing.rollbackCorrelationId === command.correlationId
    && existing.rollbackApprovalId === command.approvalId
    && existing.rollbackActorSubject === command.actorSubject
    && existing.rollbackCredentialId === context.credentialId
  ) return commandReceiptEnvelope(existing, 'rollback', true);
  const { source, task } = await loadRollbackSubject(db, command, context);
  const preview = leozOpsTaskPreviewEvidence(command, {
    taskStateFingerprint: leozOpsTaskStateFingerprint(task),
    now,
  });
  const committed = await db.$transaction(async (tx) => {
    const current = await tx.leozOpsTaskCommand.findUnique({ where: { id: command.commandId } });
    if (
      current?.status === 'rolled_back'
      && current.rollbackIdempotencyKey === command.idempotencyKey
      && current.rollbackCorrelationId === command.correlationId
      && current.rollbackApprovalId === command.approvalId
      && current.rollbackActorSubject === command.actorSubject
      && current.rollbackCredentialId === context.credentialId
    ) return { row: current, replayed: true };
    if (!current || current.status !== 'active') {
      throw new LeozOpsTaskCommandError('Task command is not rollback-eligible.', 409, 'leozops_task_rollback_unavailable');
    }
    const currentTask = await tx.task.findUnique({ where: { id: current.taskId }, select: TASK_SELECT });
    const linkedRecords = currentTask ? await taskRollbackBlockers(tx, current.taskId) : 0;
    if (!currentTask || leozOpsTaskStateFingerprint(currentTask) !== current.taskStateFingerprint || linkedRecords !== 0) {
      throw new LeozOpsTaskCommandError('Task changed after execution and cannot be rolled back automatically.', 409, 'leozops_task_rollback_state_changed');
    }
    const approval = await tx.leozOpsTaskCommandApproval.findUnique({ where: { id: command.approvalId } });
    assertApprovalMatches(approval, command, preview, context, 'rollback', now);
    const deleted = await tx.task.deleteMany({ where: { id: current.taskId, updatedAt: currentTask.updatedAt } });
    if (deleted.count !== 1) {
      throw new LeozOpsTaskCommandError('Task changed during rollback.', 409, 'leozops_task_rollback_race');
    }
    const rollbackReceiptId = `rollback:${current.id}`;
    const rollbackRequestFingerprint = leozOpsTaskRequestFingerprint(command);
    const rollbackResultFingerprint = hashLeozOpsTaskValue({
      commandId: current.id,
      taskId: current.taskId,
      executionResultFingerprint: current.executionResultFingerprint,
      rollbackRequestFingerprint,
    });
    const updated = await tx.leozOpsTaskCommand.update({
      where: { id: current.id },
      data: {
        status: 'rolled_back',
        rollbackReceiptId,
        rollbackIdempotencyKey: command.idempotencyKey,
        rollbackCorrelationId: command.correlationId,
        rollbackActorSubject: command.actorSubject,
        rollbackRequestFingerprint,
        rollbackPreviewFingerprint: preview.previewFingerprint,
        rollbackApprovalId: approval.id,
        rollbackResultFingerprint,
        rollbackCredentialId: context.credentialId,
        rolledBackAt: now,
      },
    });
    await tx.leozOpsTaskCommandApproval.update({
      where: { id: approval.id },
      data: { consumedAt: now, consumedByCommandId: current.id },
    });
    await tx.realmChangeEvent.create({
      data: { resource: 'tasks', action: 'delete', entityId: current.taskId, actorId: user.id, domains: '["tasks"]', createdAt: now },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: 'leozops_task_create_rollback',
        entity: 'tasks',
        refId: current.taskId,
        detail: `command=${current.id}; correlation=${command.correlationId}; approval=${approval.id}`,
      },
    });
    return { row: updated, replayed: false };
  }, { isolationLevel: 'Serializable' });
  return commandReceiptEnvelope(committed.row, 'rollback', committed.replayed);
}

export async function executeLeozOpsTaskCommand(db, user, input, now = new Date(), context = {}) {
  const command = normalizeLeozOpsTaskCommand(input);
  if (command.operation === 'preview') return previewCreate(db, user, command, now, context);
  if (command.operation === 'approve_execute') return approve(db, user, command, now, context, 'execute');
  if (command.operation === 'execute') return execute(db, user, command, now, context);
  if (command.operation === 'preview_rollback') return previewRollback(db, user, command, now, context);
  if (command.operation === 'approve_rollback') return approve(db, user, command, now, context, 'rollback');
  if (command.operation === 'rollback') return rollback(db, user, command, now, context);
  throw new LeozOpsTaskCommandError('Task command operation is unsupported.', 400, 'leozops_task_operation_unsupported');
}

export async function findLeozOpsTaskCommandReceipt(db, user, { correlationId, entityId } = {}) {
  requireDirector(user);
  const normalized = String(correlationId || '').trim();
  if (!SAFE_CORRELATION.test(normalized)) {
    throw new LeozOpsTaskCommandError('correlationId is invalid.', 400, 'leozops_task_correlation_id_invalid');
  }
  const row = await db.leozOpsTaskCommand.findFirst({
    where: { targetEntityId: entityId, OR: [{ correlationId: normalized }, { rollbackCorrelationId: normalized }] },
  });
  if (!row) throw new LeozOpsTaskCommandError('Task command receipt was not found.', 404, 'leozops_task_receipt_not_found');
  return commandReceiptEnvelope(row, row.rollbackCorrelationId === normalized ? 'rollback' : 'execute', true);
}

const SAFE_CORRELATION = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/;
