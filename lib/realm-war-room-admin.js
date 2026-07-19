import { RealmOperationError } from './realm-erp-adapter.js';
import { realmGuildScope } from './realm-guild-admin.js';
import { createRealmWarRoomDashboard } from './realm-war-room.js';
import { RESOURCES, canWrite } from './registry.js';

function projectIdOf(value) {
  const id = String(value ?? '').trim();
  if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(id)) {
    throw new RealmOperationError('Mã chiến dịch không hợp lệ.', 400, 'campaign_id_invalid');
  }
  return id;
}

export async function loadRealmWarRoomDashboard(db, user, requestedProjectId, now = new Date()) {
  const scope = realmGuildScope(user);
  if (scope.kind === 'none') {
    throw new RealmOperationError('Không xác định được phạm vi War Room.', 403, 'war_room_scope_missing');
  }
  const projectId = projectIdOf(requestedProjectId);
  const team = scope.kind === 'team'
    ? await db.team.findUnique({ where: { id: scope.teamId }, select: { id: true, name: true, leadId: true } })
    : null;
  const members = await db.user.findMany({
    where: scope.kind === 'company'
      ? { status: 'active', userType: 'employee' }
      : scope.kind === 'team'
        ? { teamId: scope.teamId, status: 'active', userType: 'employee' }
        : { id: scope.userId, status: 'active', userType: 'employee' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 100,
  });
  const memberIds = members.map((member) => member.id);
  const tasks = memberIds.length ? await db.task.findMany({
    where: { projectId, assigneeId: { in: memberIds } },
    select: {
      id: true,
      title: true,
      assigneeId: true,
      status: true,
      priority: true,
      dueDate: true,
      dependsOn: true,
      checklist: true,
      phaseId: true,
      assignee: { select: { id: true, name: true } },
      realmQuest: { select: { active: true, approvedAt: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: 500,
  }) : [];

  // Deliberately return the same response for an unknown project and a project
  // that has no Task in the caller's Guild scope. This avoids leaking project IDs.
  if (!tasks.length) {
    throw new RealmOperationError('Không tìm thấy chiến dịch trong phạm vi Guild của bạn.', 404, 'campaign_not_found');
  }

  const [project, phases, milestones, rewardEntries] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, status: true, startDate: true, deadline: true, progress: true, autoProgress: true },
    }),
    db.phase.findMany({
      where: { projectId },
      select: { id: true, name: true, order: true, color: true },
      orderBy: { order: 'asc' },
      take: 100,
    }),
    db.milestone.findMany({
      where: { projectId },
      select: { id: true, name: true, date: true, done: true },
      orderBy: { date: 'asc' },
      take: 100,
    }),
    db.realmGoldEntry.findMany({
      where: { type: 'quest_reward', sourceType: 'task', sourceId: { in: tasks.map((task) => task.id) } },
      select: { sourceId: true },
      take: 500,
    }),
  ]);
  if (!project) {
    throw new RealmOperationError('Không tìm thấy chiến dịch trong phạm vi Guild của bạn.', 404, 'campaign_not_found');
  }
  const commentRows = await db.taskComment.findMany({
    where: { taskId: { in: tasks.map((task) => task.id) } },
    select: { id: true, taskId: true, userId: true, content: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1500,
  });
  const knownAuthors = new Map(members.map((member) => [member.id, member]));
  const unknownAuthorIds = [...new Set(commentRows.map((comment) => comment.userId).filter((id) => id && !knownAuthors.has(id)))];
  const commentAuthors = unknownAuthorIds.length ? await db.user.findMany({
    where: { id: { in: unknownAuthorIds } }, select: { id: true, name: true }, take: 100,
  }) : [];
  for (const author of commentAuthors) knownAuthors.set(author.id, author);
  const commentsByTask = new Map(tasks.map((task) => [task.id, []]));
  for (const comment of commentRows) {
    const comments = commentsByTask.get(comment.taskId);
    if (comments && comments.length < 3) comments.push({ ...comment, author: knownAuthors.get(comment.userId) || null });
  }
  const lead = members.find((member) => member.id === team?.leadId);
  const taskWriteAllowed = canWrite('tasks', user);
  const commentWriteAllowed = canWrite('taskcomments', user);
  return createRealmWarRoomDashboard({
    source: 'erp',
    project: { ...project, owner: lead?.name || 'Guild Council' },
    tasks: tasks.map((task) => ({
      ...task,
      comments: commentsByTask.get(task.id) || [],
      canTransition: taskWriteAllowed && (!RESOURCES.tasks.canWriteRow || RESOURCES.tasks.canWriteRow(task, user)),
      canComment: commentWriteAllowed,
    })),
    phases,
    milestones,
    rewardedSourceIds: new Set(rewardEntries.map((entry) => entry.sourceId).filter(Boolean)),
    generatedAt: now.toISOString(),
    now,
    permissions: { scope: scope.kind, teamId: team?.id || null, canTransition: taskWriteAllowed, canComment: commentWriteAllowed },
  });
}
