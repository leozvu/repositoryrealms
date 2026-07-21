export const EXECUTION_OPEN_STATES = Object.freeze(['todo', 'doing', 'in_progress', 'review', 'waiting', 'blocked']);
export const EXECUTION_WIP_STATES = Object.freeze(['doing', 'in_progress', 'review']);
export const EXECUTION_TERMINAL_STATES = Object.freeze(['done', 'merged']);

export const MY_WORK_QUEUES = Object.freeze([
  Object.freeze({ key: 'inbox', label: 'Inbox', description: 'Việc mới cần đọc và sắp xếp.' }),
  Object.freeze({ key: 'planned', label: 'Tiếp theo', description: 'Việc đã rõ thứ tự và sẵn sàng làm.' }),
  Object.freeze({ key: 'doing', label: 'Đang làm', description: 'Giới hạn WIP để giữ tập trung.' }),
  Object.freeze({ key: 'waiting', label: 'Đang chờ', description: 'Chờ phản hồi hoặc đầu vào bên ngoài.' }),
  Object.freeze({ key: 'blocked', label: 'Bị chặn', description: 'Cần hỗ trợ hoặc quyết định.' }),
  Object.freeze({ key: 'completed', label: 'Đã xong', description: 'Hoàn tất gần đây và task đã merge.' }),
]);

function day(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
}

export function normalizedExecutionStatus(status) {
  if (status === 'in_progress') return 'doing';
  return String(status || 'todo');
}

export function myWorkQueueFor(task, today = new Date().toISOString().slice(0, 10)) {
  const status = normalizedExecutionStatus(task?.status);
  if (status === 'done' || status === 'merged') return 'completed';
  if (status === 'blocked') return 'blocked';
  if (status === 'waiting' || status === 'review') return 'waiting';
  if (status === 'doing') return 'doing';
  const due = day(task?.dueDate);
  if ((task?.queuePosition || 0) > 0 || due && due <= today) return 'planned';
  return 'inbox';
}

function priorityWeight(priority) {
  return { urgent: 0, high: 1, medium: 2, low: 3 }[priority] ?? 2;
}

export function compareWorkItems(left, right) {
  const leftPosition = Number(left?.queuePosition || 0);
  const rightPosition = Number(right?.queuePosition || 0);
  if (leftPosition > 0 || rightPosition > 0) {
    if (!leftPosition) return 1;
    if (!rightPosition) return -1;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
  }
  const priority = priorityWeight(left?.priority) - priorityWeight(right?.priority);
  if (priority) return priority;
  const due = String(left?.dueDate || '9999-12-31').localeCompare(String(right?.dueDate || '9999-12-31'));
  if (due) return due;
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

export function buildMyWorkReadModel(tasks = [], { today = new Date().toISOString().slice(0, 10) } = {}) {
  const queues = Object.fromEntries(MY_WORK_QUEUES.map((queue) => [queue.key, []]));
  for (const task of tasks) queues[myWorkQueueFor(task, today)].push(task);
  for (const rows of Object.values(queues)) rows.sort(compareWorkItems);
  const open = tasks.filter((task) => EXECUTION_OPEN_STATES.includes(String(task.status)));
  return {
    queues,
    metrics: {
      open: open.length,
      doing: queues.doing.length,
      waiting: queues.waiting.length,
      blocked: queues.blocked.length,
      overdue: open.filter((task) => day(task.dueDate) && task.dueDate < today).length,
    },
  };
}

export function capacityBand(wip, limit) {
  const safeLimit = Math.max(1, Number(limit) || 5);
  const ratio = wip / safeLimit;
  if (ratio > 1) return { key: 'over', label: 'Vượt WIP', ratio };
  if (ratio >= 0.8) return { key: 'near', label: 'Gần giới hạn', ratio };
  return { key: 'available', label: 'Còn khả năng nhận việc', ratio };
}

export function buildTeamWorkReadModel({ members = [], tasks = [], queueStates = [], today = new Date().toISOString().slice(0, 10), scope = 'team' } = {}) {
  const queueByOwner = new Map(queueStates.map((queue) => [queue.ownerId, queue]));
  const rows = members.map((member) => {
    const memberTasks = tasks.filter((task) => task.assigneeId === member.id).sort(compareWorkItems);
    const open = memberTasks.filter((task) => EXECUTION_OPEN_STATES.includes(String(task.status)));
    const wip = memberTasks.filter((task) => EXECUTION_WIP_STATES.includes(String(task.status))).length;
    const queue = queueByOwner.get(member.id) || { ownerId: member.id, version: 0, wipLimit: 5 };
    return {
      member,
      queue: { version: queue.version, wipLimit: queue.wipLimit },
      capacity: capacityBand(wip, queue.wipLimit),
      metrics: {
        open: open.length,
        wip,
        blocked: memberTasks.filter((task) => task.status === 'blocked').length,
        waiting: memberTasks.filter((task) => ['waiting', 'review'].includes(task.status)).length,
        overdue: open.filter((task) => day(task.dueDate) && task.dueDate < today).length,
        estimatedOpenHours: Math.round(open.reduce((sum, task) => sum + Math.max(0, Number(task.estHours) || 0), 0) * 10) / 10,
      },
      tasks: memberTasks,
    };
  });
  const unassigned = tasks.filter((task) => !task.assigneeId && EXECUTION_OPEN_STATES.includes(String(task.status))).sort(compareWorkItems);
  return {
    scope,
    members: rows,
    unassigned,
    metrics: {
      people: rows.length,
      open: rows.reduce((sum, row) => sum + row.metrics.open, 0) + unassigned.length,
      wip: rows.reduce((sum, row) => sum + row.metrics.wip, 0),
      blocked: rows.reduce((sum, row) => sum + row.metrics.blocked, 0),
      overdue: rows.reduce((sum, row) => sum + row.metrics.overdue, 0),
      overCapacity: rows.filter((row) => row.capacity.key === 'over').length,
      unassigned: unassigned.length,
    },
    policy: {
      employeeRanking: false,
      presenceAsProductivity: false,
      capacityUnit: 'wip',
    },
  };
}
