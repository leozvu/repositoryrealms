import crypto from 'node:crypto';
import { RESOURCES, canWrite } from './registry.js';
import { hasAny } from './perm.js';
import { realmGuildScope } from './realm-guild-admin.js';
import { realmEmbassyScope } from './realm-embassy-admin.js';
import { RealmOperationError, normalizeRealmIdempotencyKey } from './realm-operation.js';
import {
  normalizeRealmFollowupDraft,
  normalizeRealmTaskCommentDraft,
  realmLeadTransitions,
  realmTaskTransitions,
} from './realm-action-contract.js';

const ACTIONS = new Set(['task.transition', 'task.assign', 'lead.transition', 'task.comment.create', 'lead.followup.create']);
const ID = /^[a-zA-Z0-9:_-]{1,100}$/;
const STATE = /^[a-z_]{2,30}$/;

function token(value, pattern, message, code) {
  const normalized = String(value ?? '').trim();
  if (!pattern.test(normalized)) throw new RealmOperationError(message, 400, code);
  return normalized;
}

function payloadHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalId(value, message, code) {
  if (value === null || value === undefined || value === '') return null;
  return token(value, ID, message, code);
}

function optionalDay(value, message, code) {
  if (value === null || value === undefined || value === '') return null;
  const day = String(value).trim();
  if (!validDay(day)) throw new RealmOperationError(message, 400, code);
  return day;
}

function commandOf(input = {}) {
  const action = token(input.action, /^[a-z.]{5,40}$/, 'Realm action không hợp lệ.', 'realm_action_invalid');
  if (!ACTIONS.has(action)) throw new RealmOperationError('Realm action chưa được cho phép.', 400, 'realm_action_unsupported');
  const base = {
    action,
    entityId: token(input.entityId, ID, 'Mã bản ghi không hợp lệ.', 'realm_action_entity_invalid'),
    idempotencyKey: normalizeRealmIdempotencyKey(input.idempotencyKey),
  };
  if (action === 'task.transition' || action === 'lead.transition') {
    const expectedState = token(input.expectedState, STATE, 'Trạng thái kỳ vọng không hợp lệ.', 'realm_action_state_invalid');
    const nextState = token(input.nextState, STATE, 'Trạng thái đích không hợp lệ.', 'realm_action_state_invalid');
    return { ...base, expectedState, nextState, payloadHash: payloadHash({ expectedState, nextState }) };
  }
  if (action === 'task.assign') {
    const expectedAssigneeId = optionalId(input.expectedAssigneeId, 'Người phụ trách hiện tại không hợp lệ.', 'realm_assignment_expected_invalid');
    const assigneeId = token(input.assigneeId, ID, 'Người nhận việc không hợp lệ.', 'realm_assignment_target_invalid');
    const expectedDueDate = optionalDay(input.expectedDueDate, 'Hạn hiện tại không hợp lệ.', 'realm_assignment_expected_due_invalid');
    const dueDate = optionalDay(input.dueDate, 'Hạn hoàn thành không hợp lệ.', 'realm_assignment_due_invalid');
    const expectedPriority = token(input.expectedPriority, /^(low|medium|high|urgent)$/, 'Ưu tiên hiện tại không hợp lệ.', 'realm_assignment_expected_priority_invalid');
    const priority = token(input.priority, /^(low|medium|high|urgent)$/, 'Ưu tiên mới không hợp lệ.', 'realm_assignment_priority_invalid');
    const expectedState = `${expectedAssigneeId || 'unassigned'}:${expectedPriority}:${expectedDueDate || 'none'}`;
    const nextState = `${assigneeId}:${priority}:${dueDate || 'none'}`;
    const assignment = { expectedAssigneeId, assigneeId, expectedDueDate, dueDate, expectedPriority, priority };
    return { ...base, ...assignment, expectedState, nextState, payloadHash: payloadHash(assignment) };
  }
  if (action === 'task.comment.create') {
    const content = normalizeRealmTaskCommentDraft(input.content);
    if (!content) throw new RealmOperationError('Ghi chú War Council không được để trống.', 400, 'realm_task_comment_empty');
    if (String(input.content ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().length > 800) {
      throw new RealmOperationError('Ghi chú War Council tối đa 800 ký tự.', 400, 'realm_task_comment_too_long');
    }
    return { ...base, content, expectedState: 'none', nextState: 'created', payloadHash: payloadHash({ content }) };
  }
  const followup = normalizeRealmFollowupDraft(input);
  if (!followup.kind) throw new RealmOperationError('Loại follow-up không hợp lệ.', 400, 'realm_followup_kind_invalid');
  if (!followup.title) throw new RealmOperationError('Tiêu đề follow-up không được để trống.', 400, 'realm_followup_title_empty');
  if (String(input.title ?? '').trim().length > 160) throw new RealmOperationError('Tiêu đề follow-up tối đa 160 ký tự.', 400, 'realm_followup_title_too_long');
  if (!validDay(followup.date)) throw new RealmOperationError('Ngày follow-up không hợp lệ.', 400, 'realm_followup_date_invalid');
  return { ...base, ...followup, expectedState: 'none', nextState: 'created', payloadHash: payloadHash(followup) };
}

function sameReceipt(receipt, user, command, resource) {
  return receipt?.userId === user.id
    && receipt.action === command.action
    && receipt.resource === resource
    && receipt.entityId === command.entityId
    && receipt.fromState === command.expectedState
    && receipt.toState === command.nextState
    && (!receipt.payloadHash || receipt.payloadHash === command.payloadHash);
}

function replayResult(receipt, command, resource) {
  return {
    idempotent: true,
    resource,
    action: {
      id: receipt.id,
      type: command.action,
      entityId: command.entityId,
      fromState: command.expectedState,
      toState: command.nextState,
      resultId: receipt.resultId || null,
    },
    before: null,
    updated: null,
  };
}

async function existingReceipt(db, user, command, resource) {
  const receipt = await db.realmActionReceipt.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
  if (!receipt) return null;
  if (!sameReceipt(receipt, user, command, resource)) {
    throw new RealmOperationError('Idempotency key đã được dùng cho một lệnh khác.', 409, 'realm_action_idempotency_conflict');
  }
  return replayResult(receipt, command, resource);
}

function requireAllowedTransition(current, next, allowed, code) {
  if (!allowed(current).includes(next)) {
    throw new RealmOperationError('Không thể chuyển bản ghi từ trạng thái hiện tại sang trạng thái đã chọn.', 409, code);
  }
}

function requireExpected(current, expected) {
  if (current !== expected) {
    throw new RealmOperationError('Bản ghi vừa được cập nhật ở nơi khác. Hãy tải lại trước khi thao tác.', 409, 'realm_action_stale');
  }
}

function taskInScope(task, user) {
  const scope = realmGuildScope(user);
  if (scope.kind === 'company') return true;
  if (scope.kind === 'team') return Boolean(task?.assigneeId) && task?.assignee?.teamId === scope.teamId;
  if (scope.kind === 'self') return task?.assigneeId === scope.userId;
  return false;
}

function leadInScope(lead, user) {
  const scope = realmEmbassyScope(user);
  if (scope.kind === 'company') return true;
  return scope.kind === 'portfolio' && (lead?.ownerId === scope.userId || lead?.ownerId == null);
}

function auditData(user, command, resource) {
  return {
    userId: user.id,
    userName: user.name || 'ERP user',
    action: 'realm_action',
    entity: resource,
    refId: command.entityId,
    detail: `${command.action}: ${command.expectedState} -> ${command.nextState}`,
  };
}

function createAuditData(user, command, resource, resultId) {
  return {
    userId: user.id,
    userName: user.name || 'ERP user',
    action: 'realm_action',
    entity: resource,
    refId: command.entityId,
    detail: `${command.action}: created ${resultId}`,
  };
}

async function transitionTask(db, user, command, now) {
  if (!canWrite('tasks', user)) throw new RealmOperationError('Bạn không có quyền cập nhật Task.', 403, 'realm_task_forbidden');
  const before = await db.task.findUnique({
    where: { id: command.entityId },
    include: { assignee: { select: { id: true, teamId: true } } },
  });
  if (!before || !taskInScope(before, user)) throw new RealmOperationError('Không tìm thấy Task trong phạm vi Guild của bạn.', 404, 'realm_task_not_found');
  if (RESOURCES.tasks.canWriteRow && !RESOURCES.tasks.canWriteRow(before, user)) {
    throw new RealmOperationError('Bạn không có quyền cập nhật Task này.', 403, 'realm_task_forbidden');
  }
  requireExpected(before.status, command.expectedState);
  requireAllowedTransition(before.status, command.nextState, realmTaskTransitions, 'realm_task_transition_invalid');
  const validation = await RESOURCES.tasks.validate?.(before, { status: command.nextState }, db);
  if (validation) throw new RealmOperationError(validation, 409, 'realm_task_validation_failed');

  const result = await db.$transaction(async (tx) => {
    const changed = await tx.task.updateMany({
      where: { id: command.entityId, status: command.expectedState },
      data: { status: command.nextState, statusSince: now.toISOString().slice(0, 10) },
    });
    if (changed.count !== 1) throw new RealmOperationError('Task vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'realm_action_stale');
    const updated = await tx.task.findUnique({ where: { id: command.entityId } });
    const receipt = await tx.realmActionReceipt.create({ data: {
      idempotencyKey: command.idempotencyKey, userId: user.id, action: command.action,
      resource: 'tasks', entityId: command.entityId, fromState: command.expectedState, toState: command.nextState,
      payloadHash: command.payloadHash,
    } });
    await tx.auditLog.create({ data: auditData(user, command, 'tasks') });
    return { updated, receipt };
  });
  return { idempotent: false, resource: 'tasks', event: 'update', before, updated: result.updated, action: {
    id: result.receipt.id, type: command.action, entityId: command.entityId,
    fromState: command.expectedState, toState: command.nextState,
  } };
}

async function assignTask(db, user, command) {
  if (!hasAny(user, ['PM', 'LEAD'])) {
    throw new RealmOperationError('Chỉ PM hoặc Trưởng nhóm được phân công Task.', 403, 'realm_assignment_forbidden');
  }
  const before = await db.task.findUnique({
    where: { id: command.entityId },
    include: { assignee: { select: { id: true, teamId: true } } },
  });
  if (!before || !taskInScope(before, user)) {
    throw new RealmOperationError('Không tìm thấy Task trong phạm vi điều phối của bạn.', 404, 'realm_task_not_found');
  }
  if (before.status === 'done') throw new RealmOperationError('Task đã hoàn tất không thể phân công lại.', 409, 'realm_assignment_task_done');
  if (before.assigneeId !== command.expectedAssigneeId
    || (before.dueDate || null) !== command.expectedDueDate
    || before.priority !== command.expectedPriority) {
    throw new RealmOperationError('Task vừa được cập nhật ở nơi khác. Hãy tải lại trước khi phân công.', 409, 'realm_action_stale');
  }
  const target = await db.user.findUnique({
    where: { id: command.assigneeId },
    select: { id: true, teamId: true, status: true, userType: true },
  });
  if (!target || target.status !== 'active' || target.userType !== 'employee') {
    throw new RealmOperationError('Người nhận việc không khả dụng.', 400, 'realm_assignment_target_invalid');
  }
  const scope = realmGuildScope(user);
  if (scope.kind === 'team' && target.teamId !== scope.teamId) {
    throw new RealmOperationError('Trưởng nhóm chỉ được phân công trong Guild của mình.', 403, 'realm_assignment_target_outside_scope');
  }

  const result = await db.$transaction(async (tx) => {
    const changed = await tx.task.updateMany({
      where: {
        id: command.entityId,
        assigneeId: command.expectedAssigneeId,
        dueDate: command.expectedDueDate,
        priority: command.expectedPriority,
      },
      data: {
        assigneeId: command.assigneeId,
        dueDate: command.dueDate,
        priority: command.priority,
      },
    });
    if (changed.count !== 1) throw new RealmOperationError('Task vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'realm_action_stale');
    const updated = await tx.task.findUnique({ where: { id: command.entityId } });
    const receipt = await tx.realmActionReceipt.create({ data: {
      idempotencyKey: command.idempotencyKey,
      userId: user.id,
      action: command.action,
      resource: 'tasks',
      entityId: command.entityId,
      fromState: command.expectedState,
      toState: command.nextState,
      payloadHash: command.payloadHash,
    } });
    await tx.auditLog.create({ data: auditData(user, command, 'tasks') });
    return { updated, receipt };
  });
  return {
    idempotent: false,
    resource: 'tasks',
    event: 'update',
    before,
    updated: result.updated,
    action: {
      id: result.receipt.id,
      type: command.action,
      entityId: command.entityId,
      fromState: command.expectedState,
      toState: command.nextState,
    },
  };
}

async function transitionLead(db, user, command) {
  if (!canWrite('leads', user)) throw new RealmOperationError('Bạn không có quyền cập nhật Lead.', 403, 'realm_lead_forbidden');
  const before = await db.lead.findUnique({ where: { id: command.entityId } });
  if (!before || !leadInScope(before, user)) throw new RealmOperationError('Không tìm thấy Lead trong phạm vi Royal Embassy của bạn.', 404, 'realm_lead_not_found');
  requireExpected(before.stage, command.expectedState);
  requireAllowedTransition(before.stage, command.nextState, realmLeadTransitions, 'realm_lead_transition_invalid');

  const result = await db.$transaction(async (tx) => {
    const changed = await tx.lead.updateMany({
      where: { id: command.entityId, stage: command.expectedState },
      data: { stage: command.nextState },
    });
    if (changed.count !== 1) throw new RealmOperationError('Lead vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'realm_action_stale');
    const updated = await tx.lead.findUnique({ where: { id: command.entityId } });
    const receipt = await tx.realmActionReceipt.create({ data: {
      idempotencyKey: command.idempotencyKey, userId: user.id, action: command.action,
      resource: 'leads', entityId: command.entityId, fromState: command.expectedState, toState: command.nextState,
      payloadHash: command.payloadHash,
    } });
    await tx.auditLog.create({ data: auditData(user, command, 'leads') });
    return { updated, receipt };
  });
  return { idempotent: false, resource: 'leads', event: 'update', before, updated: result.updated, action: {
    id: result.receipt.id, type: command.action, entityId: command.entityId,
    fromState: command.expectedState, toState: command.nextState,
  } };
}

async function createTaskComment(db, user, command) {
  if (!canWrite('taskcomments', user)) throw new RealmOperationError('Bạn không có quyền bình luận Task.', 403, 'realm_task_comment_forbidden');
  const task = await db.task.findUnique({
    where: { id: command.entityId },
    include: { assignee: { select: { id: true, teamId: true } } },
  });
  if (!task || !taskInScope(task, user)) throw new RealmOperationError('Không tìm thấy Task trong phạm vi Guild của bạn.', 404, 'realm_task_not_found');
  const result = await db.$transaction(async (tx) => {
    const created = await tx.taskComment.create({ data: {
      taskId: command.entityId,
      userId: user.id,
      content: command.content,
    } });
    const receipt = await tx.realmActionReceipt.create({ data: {
      idempotencyKey: command.idempotencyKey,
      userId: user.id,
      action: command.action,
      resource: 'taskcomments',
      entityId: command.entityId,
      fromState: command.expectedState,
      toState: command.nextState,
      resultId: created.id,
      payloadHash: command.payloadHash,
    } });
    await tx.auditLog.create({ data: createAuditData(user, command, 'taskcomments', created.id) });
    return { created, receipt };
  });
  return {
    idempotent: false,
    resource: 'taskcomments',
    event: 'create',
    before: null,
    updated: result.created,
    action: {
      id: result.receipt.id,
      type: command.action,
      entityId: command.entityId,
      fromState: command.expectedState,
      toState: command.nextState,
      resultId: result.created.id,
    },
  };
}

async function createLeadFollowup(db, user, command) {
  if (!canWrite('activities', user)) throw new RealmOperationError('Bạn không có quyền tạo follow-up CRM.', 403, 'realm_followup_forbidden');
  const lead = await db.lead.findUnique({ where: { id: command.entityId } });
  if (!lead || !leadInScope(lead, user)) throw new RealmOperationError('Không tìm thấy Lead trong phạm vi Royal Embassy của bạn.', 404, 'realm_lead_not_found');
  const result = await db.$transaction(async (tx) => {
    const created = await tx.activity.create({ data: {
      kind: command.kind,
      refType: 'lead',
      refId: command.entityId,
      title: command.title,
      date: command.date,
      done: false,
      userId: user.id,
    } });
    const receipt = await tx.realmActionReceipt.create({ data: {
      idempotencyKey: command.idempotencyKey,
      userId: user.id,
      action: command.action,
      resource: 'activities',
      entityId: command.entityId,
      fromState: command.expectedState,
      toState: command.nextState,
      resultId: created.id,
      payloadHash: command.payloadHash,
    } });
    await tx.auditLog.create({ data: createAuditData(user, command, 'activities', created.id) });
    return { created, receipt };
  });
  return {
    idempotent: false,
    resource: 'activities',
    event: 'create',
    before: null,
    updated: result.created,
    action: {
      id: result.receipt.id,
      type: command.action,
      entityId: command.entityId,
      fromState: command.expectedState,
      toState: command.nextState,
      resultId: result.created.id,
    },
  };
}

function resourceFor(action) {
  if (action === 'task.transition' || action === 'task.assign') return 'tasks';
  if (action === 'lead.transition') return 'leads';
  if (action === 'task.comment.create') return 'taskcomments';
  return 'activities';
}

export async function executeRealmRecordAction(db, user, input, now = new Date()) {
  if (!user?.id) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const command = commandOf(input);
  const resource = resourceFor(command.action);
  const replay = await existingReceipt(db, user, command, resource);
  if (replay) return replay;
  try {
    if (command.action === 'task.transition') return await transitionTask(db, user, command, now);
    if (command.action === 'task.assign') return await assignTask(db, user, command);
    if (command.action === 'lead.transition') return await transitionLead(db, user, command);
    if (command.action === 'task.comment.create') return await createTaskComment(db, user, command);
    return await createLeadFollowup(db, user, command);
  } catch (error) {
    // Hai request cùng key có thể đua nhau qua bước read; unique index quyết định.
    if (error?.code !== 'P2002') throw error;
    const racedReplay = await existingReceipt(db, user, command, resource);
    if (racedReplay) return racedReplay;
    throw error;
  }
}
