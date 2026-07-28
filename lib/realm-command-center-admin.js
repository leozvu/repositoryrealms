import { hasAny, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-operation.js';
import { realmGuildScope } from './realm-guild-admin.js';
import { createRealmCommandCenterDashboard } from './realm-command-center.js';

const ID = /^[a-zA-Z0-9:_-]{1,100}$/;

function cleanText(value, max = 400) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

function commandId(value, field) {
  const id = String(value || '').trim();
  if (!ID.test(id)) throw new RealmOperationError(`${field} không hợp lệ.`, 400, 'realm_command_id_invalid');
  return id;
}

export function canManageRealmAssignments(user) {
  return hasAny(user, ['PM', 'LEAD']);
}

export function realmCommandCenterScope(user) {
  return realmGuildScope(user);
}

function startOfWeek(now) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export async function loadRealmCommandCenter(db, user, now = new Date()) {
  const scope = realmCommandCenterScope(user);
  if (scope.kind === 'none') throw new RealmOperationError('Không xác định được phạm vi Royal Command Center.', 403, 'realm_command_scope_missing');
  const memberWhere = scope.kind === 'company'
    ? { status: 'active', userType: 'employee' }
    : scope.kind === 'team'
      ? { teamId: scope.teamId, status: 'active', userType: 'employee' }
      : { id: scope.userId, status: 'active', userType: 'employee' };
  const members = await db.user.findMany({
    where: memberWhere,
    select: {
      id: true,
      name: true,
      title: true,
      teamId: true,
      realmProfile: { select: { realmClass: true, color: true } },
    },
    orderBy: { name: 'asc' },
    take: 150,
  });
  const memberIds = members.map((member) => member.id);
  const taskWhere = scope.kind === 'company'
    ? { OR: [{ assigneeId: { in: memberIds } }, { assigneeId: null }] }
    : { assigneeId: { in: memberIds } };
  const tasks = memberIds.length ? await db.task.findMany({
    where: taskWhere,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      estHours: true,
      assigneeId: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { id: 'asc' }],
    take: 750,
  }) : [];
  const taskIds = tasks.map((task) => task.id);
  const [timeLogs, handoffs] = await Promise.all([
    memberIds.length ? db.timeLog.findMany({
      where: { userId: { in: memberIds }, date: { gte: startOfWeek(now) } },
      select: { userId: true, hours: true },
      take: 2000,
    }) : [],
    taskIds.length ? db.approval.findMany({
      where: { type: 'task_handoff', refId: { in: taskIds }, status: 'pending' },
      select: { id: true, refId: true, requesterName: true, payload: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 250,
    }) : [],
  ]);
  return createRealmCommandCenterDashboard({
    source: 'erp',
    generatedAt: now.toISOString(),
    actorId: user.id,
    members,
    tasks,
    timeLogs,
    handoffs,
    permissions: {
      canAssign: canManageRealmAssignments(user),
      canRequestHandoff: true,
    },
    scope: scope.kind,
    now,
  });
}

async function handoffApprover(db, user) {
  if (user.teamId) {
    const team = await db.team.findUnique({ where: { id: user.teamId }, select: { leadId: true } });
    if (team?.leadId && team.leadId !== user.id) {
      const lead = await db.user.findUnique({
        where: { id: team.leadId },
        select: { id: true, name: true, status: true, userType: true },
      });
      if (lead?.status === 'active' && lead.userType === 'employee') {
        return { userId: lead.id, role: 'LEAD', label: lead.name || 'Trưởng Guild' };
      }
    }
  }
  const candidates = await db.user.findMany({
    where: { status: 'active', userType: 'employee' },
    select: { id: true, name: true, role: true, roles: true },
    take: 200,
  });
  const available = candidates.filter((candidate) => candidate.id !== user.id);
  const manager = available.find((candidate) => rolesOf(candidate).includes('PM'))
    || available.find((candidate) => rolesOf(candidate).includes('DIRECTOR'));
  if (!manager) throw new RealmOperationError('Chưa có PM hoặc Giám đốc để duyệt bàn giao.', 409, 'realm_handoff_approver_missing');
  return { userId: manager.id, role: rolesOf(manager).includes('PM') ? 'PM' : 'DIRECTOR', label: manager.name };
}

export async function requestRealmTaskHandoff(db, user, input = {}, now = new Date()) {
  if (!user?.id) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const taskId = commandId(input.taskId, 'Mã Task');
  const targetAssigneeId = commandId(input.targetAssigneeId, 'Người nhận bàn giao');
  const note = cleanText(input.note);
  if (!note) throw new RealmOperationError('Hãy ghi rõ lý do hoặc nội dung cần bàn giao.', 400, 'realm_handoff_note_required');
  if (String(input.note ?? '').trim().length > 400) throw new RealmOperationError('Nội dung bàn giao tối đa 400 ký tự.', 400, 'realm_handoff_note_too_long');

  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, assigneeId: true, assignee: { select: { teamId: true } } },
  });
  if (!task || task.assigneeId !== user.id || task.status === 'done') {
    throw new RealmOperationError('Bạn chỉ có thể xin bàn giao Task đang phụ trách.', 403, 'realm_handoff_task_forbidden');
  }
  if (targetAssigneeId === user.id) throw new RealmOperationError('Người nhận bàn giao phải khác người hiện tại.', 400, 'realm_handoff_target_same');
  const target = await db.user.findUnique({
    where: { id: targetAssigneeId },
    select: { id: true, name: true, teamId: true, status: true, userType: true },
  });
  if (!target || target.status !== 'active' || target.userType !== 'employee') {
    throw new RealmOperationError('Người nhận bàn giao không khả dụng.', 400, 'realm_handoff_target_invalid');
  }
  if (user.teamId && target.teamId !== user.teamId) {
    throw new RealmOperationError('Bàn giao ngoài Guild cần được điều phối trực tiếp bởi PM.', 403, 'realm_handoff_target_outside_team');
  }
  const duplicate = await db.approval.findFirst({
    where: { type: 'task_handoff', refId: task.id, requesterId: user.id, status: 'pending' },
    select: { id: true },
  });
  if (duplicate) throw new RealmOperationError('Task này đã có yêu cầu bàn giao đang chờ duyệt.', 409, 'realm_handoff_pending');
  const approver = await handoffApprover(db, user);
  const title = `Duyệt bàn giao “${task.title}” → ${target.name}`;
  const payload = JSON.stringify({
    taskId: task.id,
    expectedAssigneeId: user.id,
    targetAssigneeId: target.id,
    note,
  });
  const steps = JSON.stringify([{
    role: approver.role,
    userId: approver.userId,
    label: approver.label,
    status: 'pending',
  }]);
  const approval = await db.$transaction(async (tx) => {
    const created = await tx.approval.create({ data: {
      type: 'task_handoff',
      refId: task.id,
      title,
      payload,
      requesterId: user.id,
      requesterName: user.name || 'Guild member',
      steps,
      status: 'pending',
      createdAt: now,
    } });
    await tx.auditLog.create({ data: {
      userId: user.id,
      userName: user.name || 'Guild member',
      action: 'request',
      entity: 'approvals',
      refId: created.id,
      detail: title,
    } });
    return created;
  });
  return {
    approval: { id: approval.id, title: approval.title, status: approval.status },
    approverIds: [approver.userId],
    task: { id: task.id, title: task.title },
  };
}
