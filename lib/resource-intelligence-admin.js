import crypto from 'node:crypto';
import { realmGuildScope } from './realm-guild-admin.js';
import { RealmOperationError, normalizeRealmIdempotencyKey } from './realm-operation.js';
import { hasAny, isFreelancer } from './perm.js';
import {
  buildTaskResourceIntelligence,
  normalizedResourceComplexity,
  normalizedResourceWorkType,
  summarizeResourceIntelligence,
} from './resource-intelligence.js';

export const RESOURCE_INTELLIGENCE_ACTIONS = Object.freeze(['task.estimate']);

const ID = /^[a-zA-Z0-9:_-]{1,100}$/;
const REASON_CODE = /^[a-z][a-z0-9_]{1,39}$/;
const ESTIMATE_KINDS = new Set(['declared', 'manager_adjustment']);
const TERMINAL = new Set(['done', 'merged']);

function fail(message, status, code) {
  throw new RealmOperationError(message, status, code);
}

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function token(value, pattern, message, code) {
  const normalized = String(value ?? '').trim();
  if (!pattern.test(normalized)) fail(message, 400, code);
  return normalized;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizeResourceEstimateCommand(input = {}) {
  if (input.action !== 'task.estimate') fail('Resource Intelligence chưa cho phép action này.', 400, 'resource_intelligence_action_unsupported');
  const entityId = token(input.entityId, ID, 'Mã Task không hợp lệ.', 'resource_intelligence_task_id_invalid');
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 1_000_000) {
    fail('Work version không hợp lệ.', 400, 'resource_intelligence_work_version_invalid');
  }
  const estimateHours = Number(input.estimateHours);
  if (!Number.isFinite(estimateHours) || estimateHours < 0.25 || estimateHours > 10_000) {
    fail('Estimate phải từ 0.25 đến 10.000 giờ.', 400, 'resource_intelligence_estimate_invalid');
  }
  const estimateKind = String(input.estimateKind || '').trim();
  if (!ESTIMATE_KINDS.has(estimateKind)) fail('Loại estimate không hợp lệ.', 400, 'resource_intelligence_estimate_kind_invalid');
  const workType = normalizedResourceWorkType(input.workType);
  if (!workType) fail('Nhóm công việc không hợp lệ.', 400, 'resource_intelligence_work_type_invalid');
  const complexity = normalizedResourceComplexity(input.complexity);
  if (!complexity) fail('Độ phức tạp không hợp lệ.', 400, 'resource_intelligence_complexity_invalid');
  const reasonCode = input.reasonCode ? token(input.reasonCode, REASON_CODE, 'Mã lý do hiệu chỉnh không hợp lệ.', 'resource_intelligence_reason_code_invalid') : null;
  const note = cleanText(input.note, 500);
  if (estimateKind === 'manager_adjustment' && (!reasonCode || !note)) {
    fail('Manager adjustment cần nhóm lý do và giải thích.', 400, 'resource_intelligence_manager_reason_required');
  }
  const payload = {
    expectedVersion,
    estimateKind,
    estimateHours: Math.round(estimateHours * 100) / 100,
    workType,
    complexity,
    reasonCode,
    note: note || null,
  };
  return Object.freeze({
    action: 'task.estimate',
    entityId,
    idempotencyKey: normalizeRealmIdempotencyKey(input.idempotencyKey),
    ...payload,
    expectedState: `version:${expectedVersion}`,
    nextState: `estimate:${payload.estimateHours}:${workType}:${complexity}`,
    payloadHash: hash(payload),
  });
}

function requireAuthenticated(user) {
  if (!user?.id) fail('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) fail('Freelancer không sử dụng Resource Intelligence nội bộ.', 403, 'resource_intelligence_freelancer_forbidden');
}

function managerScope(task, user) {
  const scope = realmGuildScope(user);
  if (scope.kind === 'company') return true;
  return scope.kind === 'team' && task?.assignee?.teamId === scope.teamId;
}

function authorizeEstimate(task, user, command) {
  requireAuthenticated(user);
  if (TERMINAL.has(task.status)) fail('Không thể sửa estimate của Task đã kết thúc.', 409, 'resource_intelligence_task_terminal');
  if (command.estimateKind === 'declared') {
    if (task.assigneeId !== user.id) fail('Bạn chỉ được khai báo estimate cho Task của mình.', 403, 'resource_intelligence_declaration_forbidden');
    return;
  }
  if (!hasAny(user, ['PM', 'LEAD']) || !managerScope(task, user)) {
    fail('Bạn không có quyền hiệu chỉnh estimate trong phạm vi này.', 403, 'resource_intelligence_adjustment_forbidden');
  }
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
    before: null,
    updated: null,
    action: {
      id: receipt.id,
      type: command.action,
      entityId: command.entityId,
      fromState: command.expectedState,
      toState: command.nextState,
      resultId: receipt.resultId || null,
    },
  };
}

async function existingReceipt(db, user, command) {
  const receipt = await db.realmActionReceipt.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
  if (!receipt) return null;
  if (!receiptMatches(receipt, user, command)) fail('Idempotency key đã được dùng cho lệnh khác.', 409, 'resource_intelligence_idempotency_conflict');
  return replay(receipt, command);
}

export async function executeResourceEstimateAction(db, user, input, now = new Date()) {
  const command = normalizeResourceEstimateCommand(input);
  requireAuthenticated(user);
  const prior = await existingReceipt(db, user, command);
  if (prior) return prior;
  const task = await db.task.findUnique({
    where: { id: command.entityId },
    include: { assignee: { select: { id: true, teamId: true } } },
  });
  if (!task) fail('Không tìm thấy Task.', 404, 'resource_intelligence_task_not_found');
  authorizeEstimate(task, user, command);
  if (task.workVersion !== command.expectedVersion) fail('Task vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'resource_intelligence_work_stale');

  try {
    const result = await db.$transaction(async (tx) => {
      const changed = await tx.task.updateMany({
        where: { id: task.id, workVersion: command.expectedVersion, status: { notIn: [...TERMINAL] } },
        data: {
          estHours: command.estimateHours,
          workType: command.workType,
          complexity: command.complexity,
          workVersion: { increment: 1 },
        },
      });
      if (changed.count !== 1) fail('Task vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'resource_intelligence_work_stale');
      const receipt = await tx.realmActionReceipt.create({ data: {
        idempotencyKey: command.idempotencyKey,
        userId: user.id,
        action: command.action,
        resource: 'tasks',
        entityId: task.id,
        fromState: command.expectedState,
        toState: command.nextState,
        resultId: task.id,
        payloadHash: command.payloadHash,
      } });
      await tx.workEstimateRevision.create({ data: {
        taskId: task.id,
        actorId: user.id,
        kind: command.estimateKind,
        estimateHours: command.estimateHours,
        previousHours: Number(task.estHours) || 0,
        workType: command.workType,
        complexity: command.complexity,
        reasonCode: command.reasonCode,
        note: command.note,
        receiptId: receipt.id,
        createdAt: now,
      } });
      await tx.workItemEvent.create({ data: {
        taskId: task.id,
        action: command.action,
        actorId: user.id,
        fromState: command.expectedState,
        toState: command.nextState,
        reasonCode: command.reasonCode,
        receiptId: receipt.id,
        metadata: JSON.stringify({
          estimateKind: command.estimateKind,
          previousHours: Number(task.estHours) || 0,
          estimateHours: command.estimateHours,
          workType: command.workType,
          complexity: command.complexity,
        }),
        occurredAt: now,
      } });
      await tx.auditLog.create({ data: {
        userId: user.id,
        userName: user.name || 'ERP user',
        action: 'resource_estimate_updated',
        entity: 'tasks',
        refId: task.id,
        detail: `${command.estimateKind}: ${task.estHours || 0}h -> ${command.estimateHours}h | ${command.workType}/${command.complexity}`,
      } });
      return receipt;
    });
    const updated = {
      ...task,
      estHours: command.estimateHours,
      workType: command.workType,
      complexity: command.complexity,
      workVersion: task.workVersion + 1,
      updatedAt: now,
    };
    return {
      idempotent: false,
      resource: 'tasks',
      event: 'update',
      before: task,
      updated,
      emissions: [{ resource: 'tasks', event: 'update', before: task, updated }],
      action: {
        id: result.id,
        type: command.action,
        entityId: task.id,
        fromState: command.expectedState,
        toState: command.nextState,
        resultId: task.id,
      },
    };
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await existingReceipt(db, user, command);
    if (raced) return raced;
    throw error;
  }
}

function timeByTask(rows = []) {
  return new Map(rows.filter((row) => row.taskId).map((row) => [row.taskId, Number(row._sum?.hours) || 0]));
}

export async function enrichTasksWithResourceIntelligence(db, tasks = []) {
  if (!tasks.length) return { tasks: [], summary: summarizeResourceIntelligence([]) };
  const taskIds = tasks.map((task) => task.id);
  const workTypes = [...new Set(tasks.map((task) => normalizedResourceWorkType(task.workType)).filter(Boolean))];
  const [historicalTasks, revisions] = await Promise.all([
    workTypes.length ? db.task.findMany({
      where: { status: { in: ['done', 'merged'] }, workType: { in: workTypes } },
      select: { id: true, status: true, estHours: true, workType: true, complexity: true },
      orderBy: { completedAt: 'desc' },
      take: 1000,
    }) : [],
    db.workEstimateRevision.findMany({
      where: { taskId: { in: taskIds } },
      select: { taskId: true, kind: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(2000, taskIds.length * 20),
    }),
  ]);
  const allIds = [...new Set([...taskIds, ...historicalTasks.map((task) => task.id)])];
  const logged = allIds.length ? await db.timeLog.groupBy({
    by: ['taskId'],
    where: { taskId: { in: allIds } },
    _sum: { hours: true },
  }) : [];
  const loggedByTask = timeByTask(logged);
  const latestRevision = new Map();
  for (const revision of revisions) if (!latestRevision.has(revision.taskId)) latestRevision.set(revision.taskId, revision);
  const samples = historicalTasks.map((task) => ({ ...task, actualHours: loggedByTask.get(task.id) || 0 }));
  const enriched = tasks.map((task) => ({
    ...task,
    intelligence: buildTaskResourceIntelligence(
      { ...task, actualHours: loggedByTask.get(task.id) || 0 },
      samples,
      latestRevision.get(task.id) || null,
    ),
  }));
  return { tasks: enriched, summary: summarizeResourceIntelligence(enriched) };
}
