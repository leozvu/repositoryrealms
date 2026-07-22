const OPEN_STATUSES = new Set(['todo', 'doing', 'in_progress', 'review', 'blocked']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

const safeText = (value, fallback = '', max = 160) => {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, max);
};
const safeId = (value, fallback = 'unknown') => safeText(value, fallback, 100).replace(/[^a-zA-Z0-9:_-]/g, '-');
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dayValue = (value) => {
  const parsed = Date.parse(`${String(value || '')}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
};

function workloadLevel(percent) {
  if (percent > 100) return 'overloaded';
  if (percent >= 75) return 'busy';
  return 'steady';
}

function normalizeHandoff(row, membersById) {
  if (!row?.id || !row?.refId) return null;
  let payload = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch {}
  const target = membersById.get(payload.targetAssigneeId);
  return {
    id: safeId(row.id),
    taskId: safeId(row.refId),
    status: safeText(row.status, 'pending', 20),
    requester: safeText(row.requesterName, 'Guild member', 100),
    targetAssignee: target ? { id: target.id, name: target.name } : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

export function createRealmCommandCenterDashboard({
  source = 'local',
  generatedAt = new Date().toISOString(),
  actorId = null,
  members = [],
  tasks = [],
  timeLogs = [],
  handoffs = [],
  permissions = {},
  scope = 'self',
  now = new Date(),
} = {}) {
  const nowTime = now.getTime();
  const horizonTime = nowTime + 7 * 86_400_000;
  const memberRows = members.map((member, index) => ({
    id: safeId(member?.id, `member-${index + 1}`),
    name: safeText(member?.name, 'Guild member', 100),
    title: safeText(member?.title, 'Guild member', 100),
    realmClass: safeText(member?.realmProfile?.realmClass || member?.realmClass || member?.title, 'Realm Builder', 80),
    color: /^#[0-9a-f]{6}$/i.test(member?.realmProfile?.color || member?.color || '')
      ? String(member.realmProfile?.color || member.color).toLowerCase()
      : '#52745f',
  }));
  const membersById = new Map(memberRows.map((member) => [member.id, member]));
  const handoffRows = handoffs.map((row) => normalizeHandoff(row, membersById)).filter(Boolean);
  const pendingByTask = new Map(handoffRows.filter((row) => row.status === 'pending').map((row) => [row.taskId, row]));
  const loggedByUser = new Map();
  for (const entry of timeLogs) {
    const userId = safeId(entry?.userId, '');
    if (!membersById.has(userId)) continue;
    loggedByUser.set(userId, (loggedByUser.get(userId) || 0) + Math.max(0, finite(entry?.hours, 0)));
  }

  const taskRows = tasks.map((task, index) => {
    const id = safeId(task?.id, `task-${index + 1}`);
    const assignee = membersById.get(task?.assigneeId) || null;
    const dueValue = dayValue(task?.dueDate);
    const status = safeText(task?.status, 'todo', 30);
    const priority = PRIORITIES.has(task?.priority) ? task.priority : 'medium';
    const pendingHandoff = pendingByTask.get(id) || null;
    return {
      id,
      title: safeText(task?.title, 'Quest chưa đặt tên'),
      status,
      priority,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(task?.dueDate || '') ? task.dueDate : null,
      estHours: Math.max(0, finite(task?.estHours, 0)),
      assignee: assignee ? { id: assignee.id, name: assignee.name, title: assignee.title } : null,
      project: task?.project?.id ? {
        id: safeId(task.project.id),
        name: safeText(task.project.name, 'Việc chung'),
      } : null,
      overdue: OPEN_STATUSES.has(status) && dueValue !== null && dueValue < nowTime,
      dueSoon: OPEN_STATUSES.has(status) && dueValue !== null && dueValue >= nowTime && dueValue <= horizonTime,
      handoff: pendingHandoff,
      canAssign: permissions?.canAssign === true && status !== 'done',
      canRequestHandoff: status !== 'done' && Boolean(actorId) && assignee?.id === actorId && !pendingHandoff,
    };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue)
    || Number(b.dueSoon) - Number(a.dueSoon)
    || (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
    || a.title.localeCompare(b.title, 'vi'));

  const workload = memberRows.map((member) => {
    const owned = taskRows.filter((task) => task.assignee?.id === member.id && OPEN_STATUSES.has(task.status));
    const scheduled = owned.filter((task) => task.overdue || task.dueSoon);
    const plannedHours = scheduled.reduce((sum, task) => sum + task.estHours, 0);
    const unknownEstimate = scheduled.filter((task) => task.estHours <= 0).length;
    const capacityHours = 40;
    const loadPercent = clamp(Math.round((plannedHours / capacityHours) * 100), 0, 199);
    return {
      ...member,
      openTasks: owned.length,
      overdueTasks: owned.filter((task) => task.overdue).length,
      dueSoonTasks: owned.filter((task) => task.dueSoon).length,
      plannedHours,
      loggedHours: Math.round((loggedByUser.get(member.id) || 0) * 10) / 10,
      capacityHours,
      unknownEstimate,
      loadPercent,
      loadLevel: workloadLevel(loadPercent),
    };
  }).sort((a, b) => Number(b.overdueTasks > 0) - Number(a.overdueTasks > 0)
    || b.loadPercent - a.loadPercent
    || a.name.localeCompare(b.name, 'vi'));

  const openTasks = taskRows.filter((task) => OPEN_STATUSES.has(task.status));
  return {
    source: source === 'erp' ? 'erp' : 'local',
    generatedAt: safeText(generatedAt, now.toISOString(), 40),
    horizon: {
      days: 7,
      label: '7 ngày tới',
      capacityBasis: '40 giờ kế hoạch/người; chỉ dùng để phát hiện xung đột phân bổ',
    },
    metrics: {
      openTasks: openTasks.length,
      unassignedTasks: openTasks.filter((task) => !task.assignee).length,
      overdueTasks: openTasks.filter((task) => task.overdue).length,
      overloadedMembers: workload.filter((member) => member.loadLevel === 'overloaded').length,
      pendingHandoffs: handoffRows.filter((row) => row.status === 'pending').length,
    },
    members: memberRows,
    workload,
    tasks: taskRows,
    handoffs: handoffRows,
    permissions: {
      scope: ['company', 'team', 'self'].includes(scope) ? scope : 'self',
      canAssign: permissions?.canAssign === true,
      canRequestHandoff: permissions?.canRequestHandoff !== false,
      performanceRanking: false,
      sourceOfTruth: 'erp-task',
    },
  };
}

export function createRealmCommandCenterDemoDashboard({ members = [], quests = [] } = {}) {
  const demoMembers = members.slice(0, 6).map((member, index) => ({
    id: member.id || `demo-member-${index + 1}`,
    name: member.name,
    title: member.role || member.title,
    realmClass: member.role,
    color: member.color,
  }));
  const fallbackMember = demoMembers[0] || { id: 'demo-member-1', name: 'Adventurer', title: 'Guild member' };
  const demoTasks = quests.slice(0, 12).map((quest, index) => ({
    id: quest.businessRef || quest.id || `demo-task-${index + 1}`,
    title: quest.title,
    status: quest.status === 'claimed' ? 'done' : quest.status === 'ready' ? 'review' : 'doing',
    priority: String(quest.priority || '').toLowerCase().includes('cao') ? 'high' : 'medium',
    dueDate: null,
    estHours: Math.max(0, finite(quest.total, 0)),
    assigneeId: demoMembers.find((member) => member.name === quest.owner)?.id || fallbackMember.id,
    project: { id: `demo-project-${index + 1}`, name: quest.project || 'Demo campaign' },
  }));
  return createRealmCommandCenterDashboard({
    source: 'local',
    generatedAt: '2026-07-18T12:00:00.000Z',
    actorId: null,
    members: demoMembers,
    tasks: demoTasks,
    permissions: { canAssign: false, canRequestHandoff: false },
    scope: 'team',
    now: new Date('2026-07-18T12:00:00.000Z'),
  });
}
