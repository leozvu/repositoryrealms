import crypto from 'node:crypto';
import { buildMyWorkReadModel, buildTeamWorkReadModel, compareWorkItems, EXECUTION_OPEN_STATES } from './execution-engine.js';
import { realmGuildScope } from './realm-guild-admin.js';
import { RealmOperationError, normalizeRealmIdempotencyKey } from './realm-operation.js';
import { hasAny, isFreelancer } from './perm.js';
import { enrichTasksWithResourceIntelligence } from './resource-intelligence-admin.js';

export const EXECUTION_ACTIONS = Object.freeze([
  'task.reprioritize',
  'task.block',
  'task.unblock',
  'task.escalate',
  'task.split',
  'task.merge',
]);

const ACTION_SET = new Set(EXECUTION_ACTIONS);
const ID = /^[a-zA-Z0-9:_-]{1,100}$/;
const REASON_CODE = /^[a-z][a-z0-9_]{1,39}$/;
const NEXT_UNBLOCK_STATE = new Set(['todo', 'doing', 'in_progress']);
const TASK_SELECT = {
  id: true,
  title: true,
  projectId: true,
  assigneeId: true,
  priority: true,
  status: true,
  dueDate: true,
  note: true,
  estHours: true,
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
  project: { select: { id: true, name: true, status: true } },
};

function fail(message, status, code) {
  throw new RealmOperationError(message, status, code);
}

function token(value, pattern, message, code) {
  const normalized = String(value ?? '').trim();
  if (!pattern.test(normalized)) fail(message, 400, code);
  return normalized;
}

function integer(value, { min, max, message, code }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) fail(message, 400, code);
  return parsed;
}

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function baseCommand(input) {
  const action = token(input?.action, /^[a-z.]{5,40}$/, 'Business action không hợp lệ.', 'execution_action_invalid');
  if (!ACTION_SET.has(action)) fail('Execution Engine chưa cho phép action này.', 400, 'execution_action_unsupported');
  return {
    action,
    entityId: token(input?.entityId, ID, 'Mã Task không hợp lệ.', 'execution_task_id_invalid'),
    idempotencyKey: normalizeRealmIdempotencyKey(input?.idempotencyKey),
  };
}

export function normalizeExecutionCommand(input = {}) {
  const base = baseCommand(input);
  if (base.action === 'task.reprioritize') {
    const payload = {
      ownerId: token(input.ownerId, ID, 'Người sở hữu hàng đợi không hợp lệ.', 'execution_queue_owner_invalid'),
      expectedQueueVersion: integer(input.expectedQueueVersion, { min: 0, max: 1_000_000, message: 'Queue version không hợp lệ.', code: 'execution_queue_version_invalid' }),
      targetIndex: integer(input.targetIndex, { min: 0, max: 999, message: 'Vị trí ưu tiên không hợp lệ.', code: 'execution_queue_position_invalid' }),
    };
    return { ...base, ...payload, expectedState: `queue:${payload.expectedQueueVersion}`, nextState: `queue:${payload.expectedQueueVersion + 1}`, payloadHash: hash(payload) };
  }

  const expectedVersion = integer(input.expectedVersion, { min: 1, max: 1_000_000, message: 'Work version không hợp lệ.', code: 'execution_work_version_invalid' });
  if (base.action === 'task.block') {
    const reasonCode = token(input.reasonCode, REASON_CODE, 'Mã lý do bị chặn không hợp lệ.', 'execution_block_reason_code_invalid');
    const reason = cleanText(input.reason, 240);
    if (!reason) fail('Cần mô tả lý do Task bị chặn.', 400, 'execution_block_reason_required');
    const payload = { expectedVersion, reasonCode, reason };
    return { ...base, ...payload, expectedState: `version:${expectedVersion}`, nextState: 'blocked', payloadHash: hash(payload) };
  }
  if (base.action === 'task.unblock') {
    const nextStatus = String(input.nextStatus || 'todo').trim();
    if (!NEXT_UNBLOCK_STATE.has(nextStatus)) fail('Trạng thái sau khi gỡ chặn không hợp lệ.', 400, 'execution_unblock_state_invalid');
    const payload = { expectedVersion, nextStatus };
    return { ...base, ...payload, expectedState: `version:${expectedVersion}`, nextState: nextStatus, payloadHash: hash(payload) };
  }
  if (base.action === 'task.escalate') {
    const level = integer(input.level, { min: 1, max: 3, message: 'Mức escalation phải từ 1 đến 3.', code: 'execution_escalation_level_invalid' });
    const reasonCode = token(input.reasonCode, REASON_CODE, 'Mã lý do escalation không hợp lệ.', 'execution_escalation_reason_code_invalid');
    const reason = cleanText(input.reason, 240);
    if (!reason) fail('Cần mô tả lý do escalation.', 400, 'execution_escalation_reason_required');
    const payload = { expectedVersion, level, reasonCode, reason };
    return { ...base, ...payload, expectedState: `version:${expectedVersion}`, nextState: `escalated:${level}`, payloadHash: hash(payload) };
  }
  if (base.action === 'task.split') {
    const children = Array.isArray(input.children) ? input.children.slice(0, 10).map((child) => ({
      title: cleanText(child?.title, 180),
      estHours: Math.max(0, Math.min(10_000, Number(child?.estHours) || 0)),
    })) : [];
    if (children.length < 2 || children.some((child) => !child.title)) fail('Split cần từ 2 đến 10 đầu việc có tiêu đề.', 400, 'execution_split_children_invalid');
    const payload = { expectedVersion, children };
    return { ...base, ...payload, expectedState: `version:${expectedVersion}`, nextState: `split:${children.length}`, payloadHash: hash(payload) };
  }

  const sourceTaskIds = [...new Set((Array.isArray(input.sourceTaskIds) ? input.sourceTaskIds : []).map((id) => token(id, ID, 'Mã Task nguồn không hợp lệ.', 'execution_merge_source_invalid')))];
  if (!sourceTaskIds.includes(base.entityId)) sourceTaskIds.unshift(base.entityId);
  if (sourceTaskIds.length < 2 || sourceTaskIds.length > 10) fail('Merge cần từ 2 đến 10 Task nguồn.', 400, 'execution_merge_sources_invalid');
  const expectedVersions = Object.fromEntries(sourceTaskIds.map((id) => [id, integer(input.expectedVersions?.[id], { min: 1, max: 1_000_000, message: 'Work version nguồn không hợp lệ.', code: 'execution_work_version_invalid' })]));
  const title = cleanText(input.title, 180);
  if (!title) fail('Task sau khi merge cần có tiêu đề.', 400, 'execution_merge_title_required');
  const payload = { expectedVersion, sourceTaskIds, expectedVersions, title };
  return { ...base, ...payload, expectedState: `merge:${sourceTaskIds.length}`, nextState: 'created', payloadHash: hash(payload) };
}

function requireManager(user) {
  if (!user?.id) fail('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user) || !hasAny(user, ['PM', 'LEAD'])) fail('Chỉ PM hoặc Trưởng nhóm được điều phối công việc.', 403, 'execution_manager_forbidden');
}

// Feedback AIm 07/2026: nhân viên tự kéo thả sắp thứ tự ưu tiên hàng đợi CỦA MÌNH trong
// "Việc của tôi" — không cần vai trò quản lý, nhưng chỉ với task.reprioritize và chỉ khi
// ownerId là chính mình. Mọi action khác (block/escalate/split/merge/assign) vẫn đòi manager.
function requireSelfQueueActor(user) {
  if (!user?.id) fail('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) fail('Freelancer không sử dụng hàng đợi công việc nội bộ.', 403, 'execution_freelancer_forbidden');
}

function managerTaskScope(task, user) {
  if (task?.assigneeId === user.id) return true; // việc của chính mình luôn trong phạm vi
  const scope = realmGuildScope(user);
  if (scope.kind === 'company') return true;
  return scope.kind === 'team' && task?.assignee?.teamId === scope.teamId;
}

function managerOwnerScope(owner, user) {
  if (owner?.id === user.id) return true; // hàng đợi của chính mình
  const scope = realmGuildScope(user);
  if (scope.kind === 'company') return true;
  return scope.kind === 'team' && owner?.teamId === scope.teamId;
}

function receiptMatches(receipt, user, command) {
  return receipt?.userId === user.id
    && receipt.action === command.action
    && receipt.resource === 'tasks'
    && receipt.entityId === command.entityId
    && receipt.fromState === command.expectedState
    && receipt.toState === command.nextState
    && (!receipt.payloadHash || receipt.payloadHash === command.payloadHash);
}

function replay(receipt, command) {
  return {
    idempotent: true,
    resource: 'tasks',
    action: { id: receipt.id, type: command.action, entityId: command.entityId, fromState: command.expectedState, toState: command.nextState, resultId: receipt.resultId || null },
    before: null,
    updated: null,
  };
}

async function existingReceipt(db, user, command) {
  const receipt = await db.realmActionReceipt.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
  if (!receipt) return null;
  if (!receiptMatches(receipt, user, command)) fail('Idempotency key đã được dùng cho lệnh khác.', 409, 'execution_idempotency_conflict');
  return replay(receipt, command);
}

function audit(user, command) {
  return {
    userId: user.id,
    userName: user.name || 'ERP user',
    action: 'execution_action',
    entity: 'tasks',
    refId: command.entityId,
    detail: `${command.action}: ${command.expectedState} -> ${command.nextState}`,
  };
}

async function appendReceipt(tx, user, command, {
  resultId = null,
  eventTaskId = command.entityId,
  eventFromState = command.expectedState,
  eventToState = command.nextState,
  reasonCode = null,
  metadata = {},
} = {}) {
  const receipt = await tx.realmActionReceipt.create({ data: {
    idempotencyKey: command.idempotencyKey,
    userId: user.id,
    action: command.action,
    resource: 'tasks',
    entityId: command.entityId,
    fromState: command.expectedState,
    toState: command.nextState,
    resultId,
    payloadHash: command.payloadHash,
  } });
  await tx.workItemEvent.create({ data: {
    taskId: eventTaskId,
    action: command.action,
    actorId: user.id,
    fromState: eventFromState,
    toState: eventToState,
    reasonCode,
    relatedTaskId: resultId && resultId !== eventTaskId ? resultId : null,
    receiptId: receipt.id,
    metadata: JSON.stringify(metadata),
  } });
  await tx.auditLog.create({ data: audit(user, command) });
  return receipt;
}

async function scopedTask(db, user, id) {
  const task = await db.task.findUnique({ where: { id }, include: { assignee: { select: { id: true, teamId: true } } } });
  if (!task || !managerTaskScope(task, user)) fail('Không tìm thấy Task trong phạm vi điều phối của bạn.', 404, 'execution_task_not_found');
  return task;
}

function assertMutable(task) {
  if (['done', 'merged'].includes(task.status) || task.mergedIntoTaskId) fail('Task đã kết thúc không thể điều phối tiếp.', 409, 'execution_task_terminal');
}

function assertVersion(task, expectedVersion) {
  if (task.workVersion !== expectedVersion) fail('Task vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'execution_work_stale');
}

async function reprioritize(db, user, command) {
  const owner = await db.user.findUnique({ where: { id: command.ownerId }, select: { id: true, teamId: true, status: true, userType: true } });
  if (!owner || owner.status !== 'active' || owner.userType !== 'employee' || !managerOwnerScope(owner, user)) fail('Người sở hữu hàng đợi không thuộc phạm vi điều phối.', 403, 'execution_queue_owner_forbidden');
  const before = await scopedTask(db, user, command.entityId);
  assertMutable(before);
  if (before.assigneeId !== command.ownerId) fail('Task không thuộc hàng đợi đã chọn.', 409, 'execution_queue_task_mismatch');
  const queue = await db.workQueueState.findUnique({ where: { ownerId: command.ownerId } });
  const currentVersion = queue?.version || 0;
  if (currentVersion !== command.expectedQueueVersion) fail('Hàng đợi vừa được sắp xếp ở nơi khác. Hãy tải lại.', 409, 'execution_queue_stale');

  const result = await db.$transaction(async (tx) => {
    if (queue) {
      const changed = await tx.workQueueState.updateMany({ where: { ownerId: command.ownerId, version: command.expectedQueueVersion }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) fail('Hàng đợi vừa được sắp xếp ở nơi khác. Hãy tải lại.', 409, 'execution_queue_stale');
    } else {
      await tx.workQueueState.create({ data: { ownerId: command.ownerId, version: 1 } });
    }
    const rows = await tx.task.findMany({
      where: { assigneeId: command.ownerId, status: { in: EXECUTION_OPEN_STATES } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      select: { id: true, queuePosition: true, priority: true, dueDate: true },
      take: 1000,
    });
    const ids = rows.sort(compareWorkItems).map((row) => row.id).filter((id) => id !== command.entityId);
    ids.splice(Math.min(command.targetIndex, ids.length), 0, command.entityId);
    await Promise.all(ids.map((id, index) => tx.task.update({ where: { id }, data: { queuePosition: index + 1, ...(id === command.entityId ? { workVersion: { increment: 1 } } : {}) } })));
    const updated = await tx.task.findUnique({ where: { id: command.entityId }, select: TASK_SELECT });
    const receipt = await appendReceipt(tx, user, command, { metadata: { ownerId: command.ownerId, queueVersion: command.expectedQueueVersion + 1, position: ids.indexOf(command.entityId) + 1 } });
    return { updated, receipt };
  });
  return actionResult(command, before, result.updated, result.receipt);
}

async function mutateSingleTask(db, user, command, now) {
  const before = await scopedTask(db, user, command.entityId);
  assertMutable(before);
  assertVersion(before, command.expectedVersion);
  let data;
  let reasonCode = command.reasonCode || null;
  let metadata = {};
  if (command.action === 'task.block') {
    if (before.status === 'blocked') fail('Task đã ở trạng thái bị chặn.', 409, 'execution_task_already_blocked');
    data = { status: 'blocked', blockReason: command.reason, blockedAt: now, waitingReason: null, workVersion: { increment: 1 }, statusSince: now.toISOString().slice(0, 10) };
  } else if (command.action === 'task.unblock') {
    if (before.status !== 'blocked') fail('Chỉ Task đang bị chặn mới có thể gỡ chặn.', 409, 'execution_task_not_blocked');
    data = { status: command.nextStatus, blockReason: null, blockedAt: null, workVersion: { increment: 1 }, statusSince: now.toISOString().slice(0, 10) };
  } else {
    if (command.level <= before.escalationLevel) fail('Mức escalation mới phải cao hơn mức hiện tại.', 409, 'execution_escalation_not_higher');
    data = { escalationLevel: command.level, escalatedAt: now, workVersion: { increment: 1 } };
    metadata = { reason: command.reason, level: command.level };
  }
  const fromState = command.action === 'task.escalate' ? `escalated:${before.escalationLevel}` : before.status;
  const toState = command.action === 'task.escalate' ? command.nextState : data.status;
  const result = await db.$transaction(async (tx) => {
    const changed = await tx.task.updateMany({ where: { id: command.entityId, workVersion: command.expectedVersion }, data });
    if (changed.count !== 1) fail('Task vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'execution_work_stale');
    const updated = await tx.task.findUnique({ where: { id: command.entityId }, select: TASK_SELECT });
    const receipt = await appendReceipt(tx, user, command, { eventFromState: fromState, eventToState: toState, reasonCode, metadata });
    return { updated, receipt };
  });
  return actionResult(command, before, result.updated, result.receipt, fromState, toState);
}

async function splitTask(db, user, command, now) {
  const before = await scopedTask(db, user, command.entityId);
  assertMutable(before);
  assertVersion(before, command.expectedVersion);
  const result = await db.$transaction(async (tx) => {
    const changed = await tx.task.updateMany({
      where: { id: command.entityId, workVersion: command.expectedVersion },
      data: { status: 'waiting', waitingReason: 'split_children', workVersion: { increment: 1 }, statusSince: now.toISOString().slice(0, 10) },
    });
    if (changed.count !== 1) fail('Task vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'execution_work_stale');
    const children = [];
    for (const [index, child] of command.children.entries()) {
      children.push(await tx.task.create({ data: {
        title: child.title,
        projectId: before.projectId,
        assigneeId: before.assigneeId,
        priority: before.priority,
        status: 'todo',
        dueDate: before.dueDate,
        estHours: child.estHours,
        queuePosition: before.queuePosition > 0 ? before.queuePosition + index + 1 : 0,
        parentTaskId: before.id,
        workType: before.workType,
        complexity: before.complexity,
      } }));
    }
    const updated = await tx.task.findUnique({ where: { id: command.entityId }, select: TASK_SELECT });
    const receipt = await appendReceipt(tx, user, command, {
      resultId: children[0].id,
      eventTaskId: command.entityId,
      eventFromState: before.status,
      eventToState: 'waiting',
      metadata: { childIds: children.map((child) => child.id), childCount: children.length },
    });
    return { updated, children, receipt };
  });
  return {
    ...actionResult(command, before, result.updated, result.receipt, before.status, 'waiting'),
    related: result.children,
    emissions: [
      { resource: 'tasks', event: 'update', before, updated: result.updated },
      ...result.children.map((child) => ({ resource: 'tasks', event: 'create', before: null, updated: child })),
    ],
  };
}

async function mergeTasks(db, user, command, now) {
  const sources = await db.task.findMany({ where: { id: { in: command.sourceTaskIds } }, include: { assignee: { select: { id: true, teamId: true } } } });
  if (sources.length !== command.sourceTaskIds.length || sources.some((task) => !managerTaskScope(task, user))) fail('Không tìm thấy đủ Task nguồn trong phạm vi điều phối.', 404, 'execution_merge_sources_not_found');
  for (const task of sources) {
    assertMutable(task);
    assertVersion(task, command.expectedVersions[task.id]);
  }
  const first = sources.find((task) => task.id === command.entityId) || sources[0];
  if (sources.some((task) => task.projectId !== first.projectId || task.assigneeId !== first.assigneeId)) fail('Các Task merge phải cùng dự án và người phụ trách.', 409, 'execution_merge_scope_mismatch');
  const result = await db.$transaction(async (tx) => {
    const target = await tx.task.create({ data: {
      title: command.title,
      projectId: first.projectId,
      assigneeId: first.assigneeId,
      priority: sources.some((task) => task.priority === 'urgent') ? 'urgent' : sources.some((task) => task.priority === 'high') ? 'high' : first.priority,
      status: 'todo',
      dueDate: sources.map((task) => task.dueDate).filter(Boolean).sort()[0] || null,
      estHours: sources.reduce((sum, task) => sum + Math.max(0, Number(task.estHours) || 0), 0),
      queuePosition: (() => {
        const positions = sources.map((task) => task.queuePosition).filter((position) => position > 0);
        return positions.length ? Math.min(...positions) : 0;
      })(),
      workType: first.workType,
      complexity: first.complexity,
    } });
    for (const source of sources) {
      const changed = await tx.task.updateMany({
        where: { id: source.id, workVersion: command.expectedVersions[source.id], mergedIntoTaskId: null },
        data: { status: 'merged', mergedIntoTaskId: target.id, completedAt: now, workVersion: { increment: 1 }, statusSince: now.toISOString().slice(0, 10) },
      });
      if (changed.count !== 1) fail('Một Task nguồn vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'execution_work_stale');
    }
    const receipt = await appendReceipt(tx, user, command, {
      resultId: target.id,
      eventTaskId: target.id,
      eventFromState: command.expectedState,
      eventToState: 'created',
      metadata: { sourceTaskIds: command.sourceTaskIds, sourceCount: command.sourceTaskIds.length },
    });
    return { target, receipt };
  });
  return {
    ...actionResult(command, first, result.target, result.receipt),
    event: 'create',
    before: null,
    related: sources,
    emissions: [
      ...sources.map((source) => ({
        resource: 'tasks',
        event: 'update',
        before: source,
        updated: { ...source, status: 'merged', mergedIntoTaskId: result.target.id, completedAt: now, workVersion: source.workVersion + 1 },
      })),
      { resource: 'tasks', event: 'create', before: null, updated: result.target },
    ],
  };
}

function actionResult(command, before, updated, receipt, fromState = command.expectedState, toState = command.nextState) {
  return {
    idempotent: false,
    resource: 'tasks',
    event: 'update',
    before,
    updated,
    emissions: [{ resource: 'tasks', event: 'update', before, updated }],
    action: { id: receipt.id, type: command.action, entityId: command.entityId, fromState, toState, resultId: receipt.resultId || null },
  };
}

export async function executeExecutionAction(db, user, input, now = new Date()) {
  // task.reprioritize trên hàng đợi của CHÍNH MÌNH: nhân viên nào cũng được (tự sắp
  // thứ tự ưu tiên việc của mình). Mọi trường hợp khác giữ nguyên: chỉ PM/Trưởng nhóm.
  if (input?.action === 'task.reprioritize' && input?.ownerId && input.ownerId === user?.id) requireSelfQueueActor(user);
  else requireManager(user);
  const command = normalizeExecutionCommand(input);
  const prior = await existingReceipt(db, user, command);
  if (prior) return prior;
  try {
    if (command.action === 'task.reprioritize') return await reprioritize(db, user, command);
    if (command.action === 'task.split') return await splitTask(db, user, command, now);
    if (command.action === 'task.merge') return await mergeTasks(db, user, command, now);
    return await mutateSingleTask(db, user, command, now);
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await existingReceipt(db, user, command);
    if (raced) return raced;
    throw error;
  }
}

export async function loadMyWork(db, user, now = new Date()) {
  if (!user?.id) fail('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) fail('Freelancer không sử dụng cockpit công việc nội bộ.', 403, 'execution_freelancer_forbidden');
  const [openTasks, completedTasks, queue] = await Promise.all([
    db.task.findMany({ where: { assigneeId: user.id, status: { in: EXECUTION_OPEN_STATES } }, select: TASK_SELECT, orderBy: [{ queuePosition: 'asc' }, { dueDate: 'asc' }], take: 500 }),
    db.task.findMany({ where: { assigneeId: user.id, status: { in: ['done', 'merged'] } }, select: TASK_SELECT, orderBy: { updatedAt: 'desc' }, take: 8 }),
    db.workQueueState.findUnique({ where: { ownerId: user.id }, select: { ownerId: true, version: true, wipLimit: true } }),
  ]);
  const resource = await enrichTasksWithResourceIntelligence(db, [...openTasks, ...completedTasks]);
  return {
    ...buildMyWorkReadModel(resource.tasks, { today: now.toISOString().slice(0, 10) }),
    queue: queue || { ownerId: user.id, version: 0, wipLimit: 5 },
    resourceIntelligence: resource.summary,
    generatedAt: now.toISOString(),
    source: 'erp-task',
  };
}

export async function loadTeamWork(db, user, now = new Date()) {
  requireManager(user);
  const scope = realmGuildScope(user);
  const memberWhere = scope.kind === 'company'
    ? { status: 'active', userType: 'employee' }
    : { teamId: scope.teamId, status: 'active', userType: 'employee' };
  const members = await db.user.findMany({
    where: memberWhere,
    select: { id: true, name: true, title: true, teamId: true, realmProfile: { select: { realmClass: true, color: true } } },
    orderBy: { name: 'asc' },
    take: 200,
  });
  const memberIds = members.map((member) => member.id);
  const taskWhere = scope.kind === 'company'
    ? { status: { in: EXECUTION_OPEN_STATES }, OR: [{ assigneeId: { in: memberIds } }, { assigneeId: null }] }
    : { status: { in: EXECUTION_OPEN_STATES }, assigneeId: { in: memberIds } };
  const [tasks, queueStates] = await Promise.all([
    db.task.findMany({ where: taskWhere, select: TASK_SELECT, orderBy: [{ queuePosition: 'asc' }, { dueDate: 'asc' }], take: 1500 }),
    db.workQueueState.findMany({ where: { ownerId: { in: memberIds } }, select: { ownerId: true, version: true, wipLimit: true } }),
  ]);
  const resource = await enrichTasksWithResourceIntelligence(db, tasks);
  return {
    ...buildTeamWorkReadModel({ members, tasks: resource.tasks, queueStates, today: now.toISOString().slice(0, 10), scope: scope.kind }),
    resourceIntelligence: resource.summary,
    generatedAt: now.toISOString(),
    source: 'erp-task',
  };
}
