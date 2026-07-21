import { isDirector, rolesOf } from './perm.js';
import { RESOURCES, canWrite } from './registry.js';
import { emitEvent } from './events.js';
import { normalizeNotificationDraft, notificationRecordRoute } from './notification-inbox.js';
import {
  CEO_COMMAND_GATEWAY_VERSION,
  CEO_COMMAND_RECEIPT_CONTRACT,
  CeoCommandError,
  normalizeCeoCommandCorrelationId,
  normalizeCeoCommandEnvelope,
} from './ceo-command-gateway.js';

function requireTargetDirector(user) {
  if (!user) throw new CeoCommandError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoCommandError('Director API scope required.', 403, 'ceo_command_director_required');
}

function receiptMatches(receipt, command) {
  return Boolean(receipt
    && receipt.targetEntityId === command.targetEntityId
    && receipt.actorSubject === command.actorSubject
    && receipt.action === command.action
    && receipt.scope === command.scope
    && receipt.correlationId === command.correlationId
    && receipt.payloadHash === command.payloadHash);
}

function receiptEnvelope(receipt, replayed = false) {
  return {
    contract: CEO_COMMAND_RECEIPT_CONTRACT,
    version: CEO_COMMAND_GATEWAY_VERSION,
    receipt: {
      id: receipt.id,
      targetEntityId: receipt.targetEntityId,
      actorSubject: receipt.actorSubject,
      action: receipt.action,
      scope: receipt.scope,
      correlationId: receipt.correlationId,
      resource: receipt.resource,
      recordId: receipt.recordId || null,
      resultCount: receipt.resultCount,
      committedAt: new Date(receipt.createdAt).toISOString(),
      replayed,
    },
  };
}

async function requireActiveUserByEmail(tx, rawEmail, code = 'ceo_command_target_user_unavailable') {
  const user = await tx.user.findUnique({
    where: { email: rawEmail },
    select: { id: true, email: true, name: true, role: true, roles: true, status: true, userType: true },
  });
  if (!user || user.status !== 'active' || user.userType !== 'employee') {
    throw new CeoCommandError('Target employee is unavailable.', 422, code);
  }
  return user;
}

async function createTask(tx, command, { statusRequest = false } = {}) {
  if (!canWrite('tasks', command.user)) {
    throw new CeoCommandError('Task write is not authorized.', 403, 'ceo_command_task_forbidden');
  }
  const payload = command.payload;
  const assignee = statusRequest
    ? await requireActiveUserByEmail(tx, payload.targetEmail)
    : payload.assigneeEmail ? await requireActiveUserByEmail(tx, payload.assigneeEmail) : null;
  if (!statusRequest && payload.projectId) {
    const project = await tx.project.findUnique({ where: { id: payload.projectId }, select: { id: true } });
    if (!project) throw new CeoCommandError('Project does not exist in the target entity.', 422, 'ceo_command_project_not_found');
  }
  const draft = statusRequest ? {
    title: `Status update · ${payload.topic}`,
    note: payload.message,
    assigneeId: assignee.id,
    priority: payload.priority,
    dueDate: payload.dueDate,
    status: 'todo',
  } : {
    title: payload.title,
    note: payload.note,
    assigneeId: assignee?.id || null,
    projectId: payload.projectId,
    priority: payload.priority,
    dueDate: payload.dueDate,
    estHours: payload.estHours,
    status: 'todo',
  };
  const data = RESOURCES.tasks.beforeCreate ? await RESOURCES.tasks.beforeCreate(draft, command.user, tx) : draft;
  if (RESOURCES.tasks.validate) {
    const validationError = await RESOURCES.tasks.validate(null, data, tx);
    if (validationError) throw new CeoCommandError(validationError, 422, 'ceo_command_task_rule_failed');
  }
  const row = await tx.task.create({ data });
  return { row, resource: 'tasks', recordId: row.id, resultCount: 1, event: 'create' };
}

async function announcementRecipients(tx, payload) {
  const users = await tx.user.findMany({
    where: { status: 'active', userType: 'employee' },
    select: { id: true, role: true, roles: true },
    take: 500,
  });
  return payload.audience === 'role'
    ? users.filter((user) => rolesOf(user).includes(payload.role))
    : users;
}

async function sendAnnouncement(tx, command) {
  const recipients = await announcementRecipients(tx, command.payload);
  if (!recipients.length) {
    throw new CeoCommandError('No active recipient matches the announcement audience.', 422, 'ceo_command_audience_empty');
  }
  const draft = normalizeNotificationDraft(
    `${command.payload.title}: ${command.payload.message}`,
    '/dashboard',
  );
  await tx.notification.createMany({ data: recipients.map((recipient) => ({ userId: recipient.id, ...draft })) });
  await tx.realmChangeEvent.createMany({
    data: recipients.map((recipient) => ({
      resource: 'notifications',
      action: 'create',
      audienceUserId: recipient.id,
      actorId: command.user.id,
      domains: '["notifications"]',
    })),
  });
  return { row: null, resource: 'notifications', recordId: null, resultCount: recipients.length, event: 'create' };
}

async function requestApproval(tx, command, now) {
  const payload = command.payload;
  const candidates = await tx.user.findMany({
    where: { status: 'active', userType: 'employee' },
    select: { id: true, name: true, role: true, roles: true },
    take: 500,
  });
  const recipients = candidates.filter((candidate) => rolesOf(candidate).includes(payload.approverRole));
  if (!recipients.length) {
    throw new CeoCommandError('No active approver holds the requested role.', 422, 'ceo_command_approver_unavailable');
  }
  const row = await tx.approval.create({
    data: {
      type: 'ceo_request',
      title: payload.title,
      amount: 0,
      payload: JSON.stringify({ kind: 'ceo_request', note: payload.note, correlationId: command.correlationId }),
      requesterId: command.user.id,
      requesterName: command.user.name,
      steps: JSON.stringify([{ role: payload.approverRole, label: payload.approverRole, status: 'pending' }]),
      status: 'pending',
      createdAt: now,
    },
  });
  const notice = normalizeNotificationDraft(`Chờ bạn phản hồi: ${payload.title}`, notificationRecordRoute('approvals', row.id));
  await tx.notification.createMany({ data: recipients.map((recipient) => ({ userId: recipient.id, ...notice })) });
  await tx.realmChangeEvent.createMany({
    data: recipients.map((recipient) => ({
      resource: 'notifications', action: 'create', audienceUserId: recipient.id,
      actorId: command.user.id, domains: '["notifications"]', createdAt: now,
    })),
  });
  return { row, resource: 'approvals', recordId: row.id, resultCount: 1, event: 'create' };
}

async function requestGroupWorkforce(tx, command, now) {
  const payload = command.payload;
  if (payload.requestingEntityId === command.targetEntityId) {
    throw new CeoCommandError(
      'The requesting and employing entities must be different.',
      422,
      'ceo_command_group_workforce_same_entity',
    );
  }
  const employee = await requireActiveUserByEmail(
    tx,
    payload.employeeEmail,
    'ceo_command_group_workforce_employee_unavailable',
  );
  const consent = await tx.ceoEntityDirectoryProfile.findUnique({
    where: { userId: employee.id },
    select: { sharedWithCeoPortal: true, consentedAt: true, revokedAt: true },
  });
  if (!consent?.sharedWithCeoPortal || !consent.consentedAt || consent.revokedAt) {
    throw new CeoCommandError(
      'The employee has not consented to the shared group directory.',
      422,
      'ceo_command_group_workforce_consent_required',
    );
  }
  const candidates = await tx.user.findMany({
    where: { status: 'active', userType: 'employee' },
    select: { id: true, name: true, role: true, roles: true },
    take: 500,
  });
  const approvers = candidates.filter((candidate) => rolesOf(candidate).includes(payload.approverRole));
  if (!approvers.length) {
    throw new CeoCommandError(
      'No active approver holds the requested group-workforce role.',
      422,
      'ceo_command_group_workforce_approver_unavailable',
    );
  }
  const row = await tx.approval.create({
    data: {
      type: 'ceo_group_workforce_request',
      title: payload.title,
      amount: 0,
      payload: JSON.stringify({
        kind: 'group_workforce_request',
        requestingEntityId: payload.requestingEntityId,
        employeeId: employee.id,
        employeeEmail: employee.email,
        note: payload.note,
        startDate: payload.startDate,
        endDate: payload.endDate,
        hoursPerWeek: payload.hoursPerWeek,
        correlationId: command.correlationId,
      }),
      requesterId: command.user.id,
      requesterName: command.user.name,
      steps: JSON.stringify([{
        role: payload.approverRole,
        label: payload.approverRole,
        status: 'pending',
      }]),
      status: 'pending',
      createdAt: now,
    },
  });
  const recipientIds = [...new Set([...approvers.map((candidate) => candidate.id), employee.id])];
  const notice = normalizeNotificationDraft(
    `Yêu cầu nhân sự liên công ty: ${payload.title}`,
    notificationRecordRoute('approvals', row.id),
  );
  await tx.notification.createMany({
    data: recipientIds.map((userId) => ({ userId, ...notice })),
  });
  await tx.realmChangeEvent.createMany({
    data: recipientIds.map((userId) => ({
      resource: 'notifications',
      action: 'create',
      audienceUserId: userId,
      actorId: command.user.id,
      domains: '["notifications"]',
      createdAt: now,
    })),
  });
  return { row, resource: 'approvals', recordId: row.id, resultCount: 1, event: 'create' };
}

async function executeBusinessMutation(tx, command, now) {
  if (command.action === 'task.create') return createTask(tx, command);
  if (command.action === 'status.request') return createTask(tx, command, { statusRequest: true });
  if (command.action === 'announcement.send') return sendAnnouncement(tx, command);
  if (command.action === 'approval.request') return requestApproval(tx, command, now);
  if (command.action === 'group_workforce.request') return requestGroupWorkforce(tx, command, now);
  throw new CeoCommandError('Command is not allowlisted.', 400, 'ceo_command_unsupported');
}

async function replayOrConflict(db, command) {
  const receipt = await db.ceoEntityCommandReceipt.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
  if (!receipt) return null;
  if (!receiptMatches(receipt, command)) {
    throw new CeoCommandError('Idempotency key was used for another command.', 409, 'ceo_command_idempotency_conflict');
  }
  return receipt;
}

export async function executeCeoEntityCommand(db, user, input, now = new Date(), {
  entityId,
  enabledCapabilities = [],
  emitImpl = emitEvent,
} = {}) {
  requireTargetDirector(user);
  const command = normalizeCeoCommandEnvelope(input);
  if (command.targetEntityId !== entityId) {
    throw new CeoCommandError('Command audience does not match this entity.', 403, 'ceo_command_audience_mismatch');
  }
  if (!enabledCapabilities.includes(command.definition.capability)) {
    throw new CeoCommandError('Target entity does not expose the required capability.', 422, 'ceo_command_capability_unavailable');
  }
  const existing = await replayOrConflict(db, command);
  if (existing) {
    return { ...receiptEnvelope(existing, true), action: existing, idempotent: true, resource: existing.resource };
  }

  let committed;
  try {
    committed = await db.$transaction(async (tx) => {
      const raced = await replayOrConflict(tx, command);
      if (raced) return { receipt: raced, mutation: null, replayed: true };
      const mutation = await executeBusinessMutation(tx, { ...command, user }, now);
      const receipt = await tx.ceoEntityCommandReceipt.create({
        data: {
          idempotencyKey: command.idempotencyKey,
          correlationId: command.correlationId,
          actorSubject: command.actorSubject,
          targetEntityId: command.targetEntityId,
          action: command.action,
          scope: command.scope,
          payloadHash: command.payloadHash,
          resource: mutation.resource,
          recordId: mutation.recordId,
          resultCount: mutation.resultCount,
          createdAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name,
          action: `ceo_command_${command.action.replaceAll('.', '_')}`,
          entity: mutation.resource,
          refId: mutation.recordId,
          detail: `receipt=${receipt.id}; correlation=${command.correlationId}; actorSubject=${command.actorSubject}; scope=${command.scope}`,
        },
      });
      return { receipt, mutation, replayed: false };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await replayOrConflict(db, command);
    if (!raced) throw error;
    committed = { receipt: raced, mutation: null, replayed: true };
  }

  if (!committed.replayed && committed.mutation?.row && emitImpl) {
    await emitImpl(committed.mutation.resource, committed.mutation.event, committed.mutation.row, null, user);
  }
  return {
    ...receiptEnvelope(committed.receipt, committed.replayed),
    action: committed.receipt,
    idempotent: committed.replayed,
    resource: committed.receipt.resource,
  };
}

export async function findCeoEntityCommandReceipt(db, user, { correlationId, entityId } = {}) {
  requireTargetDirector(user);
  const normalized = normalizeCeoCommandCorrelationId(correlationId);
  const receipt = await db.ceoEntityCommandReceipt.findUnique({ where: { correlationId: normalized } });
  if (!receipt || receipt.targetEntityId !== entityId) {
    throw new CeoCommandError('Command receipt was not found.', 404, 'ceo_command_receipt_not_found');
  }
  return receiptEnvelope(receipt, true);
}

export function assertCeoCommandRequestHeaders(request, command) {
  const correlation = request.headers.get('x-correlation-id') || '';
  const idempotency = request.headers.get('idempotency-key') || '';
  const actor = request.headers.get('x-ceo-actor-subject') || '';
  const scope = request.headers.get('x-ceo-command-scope') || '';
  if (
    correlation !== command.correlationId || idempotency !== command.idempotencyKey
    || actor !== command.actorSubject || scope !== command.scope
  ) {
    throw new CeoCommandError('Command headers do not match the signed envelope.', 400, 'ceo_command_header_mismatch');
  }
}

export function ceoCommandRepositoryExecutor(context) {
  return (db, user, input, now) => executeCeoEntityCommand(db, user, input, now, context);
}
