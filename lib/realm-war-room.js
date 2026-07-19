const HEALTH = new Set(['stable', 'attention', 'critical', 'completed']);
const TASK_STATUS = new Set(['todo', 'in_progress', 'review', 'blocked', 'done']);
const PRIORITY = new Set(['low', 'medium', 'high', 'urgent']);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function safeText(value, fallback = '', max = 160) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
}

function safeId(value, fallback = 'realm-war-room') {
  const id = String(value ?? '').trim();
  return /^[a-zA-Z0-9:_-]{1,100}$/.test(id) ? id : fallback;
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dateValue(value) {
  if (!value) return null;
  const text = safeText(value, '', 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const timestamp = Date.parse(`${text}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function statusOf(value) {
  const status = safeText(value, 'todo', 30).toLowerCase();
  if (status === 'completed') return 'done';
  if (status === 'doing' || status === 'active') return 'in_progress';
  return TASK_STATUS.has(status) ? status : 'todo';
}

function priorityOf(value) {
  const priority = safeText(value, 'medium', 30).toLowerCase();
  if (priority === 'epic') return 'urgent';
  if (priority === 'skilled') return 'high';
  if (priority === 'common') return 'medium';
  return PRIORITY.has(priority) ? priority : 'medium';
}

function healthOf({ status, progress, overdueTasks, overdueMilestones, blockedTasks }) {
  if (['done', 'completed', 'closed'].includes(status) || progress >= 100) return 'completed';
  if (overdueTasks > 0 || overdueMilestones > 0) return 'critical';
  if (blockedTasks > 0) return 'attention';
  return 'stable';
}

function normalizeTask(task, index, rewardedSourceIds) {
  const checklist = parseArray(task?.checklist);
  const checklistDone = checklist.filter((item) => item?.done).length;
  const checklistTotal = checklist.length;
  const status = statusOf(task?.status);
  const questApproved = Boolean(task?.realmQuest?.active && task?.realmQuest?.approvedAt);
  const rewarded = rewardedSourceIds.has(String(task?.id || '')) || Boolean(task?.rewarded);
  const comments = (Array.isArray(task?.comments) ? task.comments : []).slice(0, 3).map((comment, commentIndex) => {
    const createdAt = new Date(comment?.createdAt || '');
    return {
      id: safeId(comment?.id, `war-comment-${index}-${commentIndex}`),
      content: safeText(comment?.content, 'Ghi chú không có nội dung', 600),
      createdAt: Number.isNaN(createdAt.getTime()) ? null : createdAt.toISOString(),
      author: safeText(comment?.author?.name, 'Thành viên ERP', 80),
    };
  });
  return {
    id: safeId(task?.id, `war-task-${index}`),
    title: safeText(task?.title, 'Quest chưa đặt tên'),
    status,
    priority: priorityOf(task?.priority),
    dueDate: dateValue(task?.dueDate) === null ? null : safeText(task.dueDate, '', 10),
    dueLabel: safeText(task?.dueLabel, '', 48),
    phaseId: task?.phaseId ? safeId(task.phaseId, 'unassigned') : 'unassigned',
    assignee: task?.assignee ? {
      id: safeId(task.assignee.id, `war-assignee-${index}`),
      name: safeText(task.assignee.name, 'Chưa phân công', 80),
    } : { id: 'unassigned', name: 'Chưa phân công' },
    dependencyIds: parseArray(task?.dependsOn).map((id) => safeId(id, '')).filter(Boolean).slice(0, 30),
    checklistDone,
    checklistTotal,
    rewardGate: rewarded ? 'claimed' : questApproved && status === 'done' ? 'ready' : questApproved ? 'approved' : 'none',
    comments,
    canTransition: Boolean(task?.canTransition),
    canComment: Boolean(task?.canComment),
  };
}

function normalizeMilestone(milestone, index, nowDay) {
  const date = dateValue(milestone?.date);
  const done = Boolean(milestone?.done);
  return {
    id: safeId(milestone?.id, `war-milestone-${index}`),
    name: safeText(milestone?.name, 'Mốc chưa đặt tên'),
    date: date === null ? null : safeText(milestone.date, '', 10),
    done,
    overdue: !done && date !== null && date < nowDay,
  };
}

function focusCopy(metrics) {
  if (metrics.overdueTasks) return `Ưu tiên xử lý ${metrics.overdueTasks} Quest quá hạn trước khi mở thêm việc mới.`;
  if (metrics.blockedTasks) return `Gỡ ${metrics.blockedTasks} blocker để khơi lại luồng chiến dịch.`;
  if (metrics.readyRewards) return `${metrics.readyRewards} Quest đã qua cổng tiêu chí và đang chờ ghi nhận thưởng.`;
  if (metrics.activeTasks) return `Giữ nhịp ${metrics.activeTasks} Quest đang chạy và rà mốc gần nhất.`;
  return 'Chiến dịch đã hoàn tất; chuẩn bị biên bản đóng War Room.';
}

export function createRealmWarRoomDashboard({
  source = 'local',
  project,
  tasks = [],
  phases = [],
  milestones = [],
  rewardedSourceIds = new Set(),
  generatedAt = new Date().toISOString(),
  now = new Date(),
  permissions = {},
} = {}) {
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const normalizedTasks = tasks.map((task, index) => normalizeTask(task, index, rewardedSourceIds));
  const taskById = new Map(normalizedTasks.map((task) => [task.id, task]));
  const taskRows = normalizedTasks.map((task) => {
    const blockers = task.dependencyIds
      .map((id) => taskById.get(id))
      .filter((dependency) => !dependency || dependency.status !== 'done')
      .map((dependency) => dependency?.title || 'Phụ thuộc ngoài phạm vi Guild');
    const due = dateValue(task.dueDate);
    const overdue = task.status !== 'done' && due !== null && due < nowDay;
    const blocked = task.status === 'blocked' || blockers.length > 0;
    const lane = task.status === 'done' ? 'done'
      : blocked ? 'blocked'
        : task.status === 'review' ? 'review'
          : task.status === 'in_progress' ? 'active' : 'backlog';
    return { ...task, blockers, blocked, overdue, lane };
  });
  const milestoneRows = milestones.map((milestone, index) => normalizeMilestone(milestone, index, nowDay));
  const projectProgress = clamp(Math.round(finite(project?.progress,
    taskRows.length ? (taskRows.filter((task) => task.status === 'done').length / taskRows.length) * 100 : 0)), 0, 100);
  const metrics = {
    totalTasks: taskRows.length,
    doneTasks: taskRows.filter((task) => task.status === 'done').length,
    activeTasks: taskRows.filter((task) => task.status !== 'done' && !task.blocked).length,
    blockedTasks: taskRows.filter((task) => task.blocked && task.status !== 'done').length,
    overdueTasks: taskRows.filter((task) => task.overdue).length,
    readyRewards: taskRows.filter((task) => task.rewardGate === 'ready').length,
    milestonesComplete: milestoneRows.filter((milestone) => milestone.done).length,
    milestonesTotal: milestoneRows.length,
    completionPercent: projectProgress,
  };
  const normalizedPhases = phases.map((phase, index) => ({
    id: safeId(phase?.id, `war-phase-${index}`),
    name: safeText(phase?.name, 'Giai đoạn chưa đặt tên', 80),
    order: Math.round(finite(phase?.order, index)),
    color: /^#[0-9a-f]{6}$/i.test(phase?.color || '') ? phase.color.toLowerCase() : '#7f9b83',
  })).sort((a, b) => a.order - b.order);
  const phaseIds = new Set(normalizedPhases.map((phase) => phase.id));
  if (taskRows.some((task) => !phaseIds.has(task.phaseId))) {
    normalizedPhases.push({ id: 'unassigned', name: 'Backlog', order: 999, color: '#8f8774' });
  }
  const phaseRows = normalizedPhases.map((phase) => ({
    ...phase,
    tasks: taskRows.filter((task) => (phaseIds.has(task.phaseId) ? task.phaseId : 'unassigned') === phase.id),
  }));
  const status = safeText(project?.status, projectProgress >= 100 ? 'done' : 'active', 30).toLowerCase();
  const health = HEALTH.has(project?.health) ? project.health : healthOf({
    status,
    progress: projectProgress,
    overdueTasks: metrics.overdueTasks,
    overdueMilestones: milestoneRows.filter((milestone) => milestone.overdue).length,
    blockedTasks: metrics.blockedTasks,
  });
  return {
    source: source === 'erp' ? 'erp' : 'local',
    generatedAt: safeText(generatedAt, now.toISOString(), 40),
    campaign: {
      id: safeId(project?.id, 'war-room-campaign'),
      name: safeText(project?.name, 'Chiến dịch chưa đặt tên'),
      status,
      health,
      progress: projectProgress,
      startDate: dateValue(project?.startDate) === null ? null : safeText(project.startDate, '', 10),
      deadline: dateValue(project?.deadline) === null ? null : safeText(project.deadline, '', 10),
      owner: safeText(project?.owner, 'Guild Council', 80),
      autoProgress: project?.autoProgress !== false,
    },
    metrics,
    phases: phaseRows,
    milestones: milestoneRows.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999'))),
    blockers: taskRows.filter((task) => task.blocked && task.status !== 'done').map((task) => ({
      taskId: task.id,
      task: task.title,
      reasons: task.blockers.length ? task.blockers : ['Được đánh dấu blocked trong ERP'],
      assignee: task.assignee.name,
    })),
    focus: focusCopy(metrics),
    permissions: {
      scope: permissions?.scope === 'company' ? 'company' : permissions?.scope === 'team' ? 'team' : 'self',
      teamId: permissions?.teamId ? safeId(permissions.teamId) : null,
      canTransition: Boolean(permissions?.canTransition),
      canComment: Boolean(permissions?.canComment),
      readOnly: !permissions?.canTransition && !permissions?.canComment,
      performanceRanking: false,
    },
  };
}

const DEMO_BLUEPRINTS = {
  'campaign-1': {
    deadline: '2026-07-19',
    phases: ['Chuẩn bị', 'Bàn giao'],
    tasks: [
      { id: 'blue-brief', title: 'Chốt phạm vi bàn giao', status: 'done', assignee: 'Lan Phạm', phase: 0 },
      { id: 'blue-handover', title: 'Biên bản nghiệm thu cuối', status: 'in_progress', assignee: 'Minh Quân', phase: 1, dependsOn: ['q-close-campaign'] },
    ],
    milestones: [{ id: 'blue-ms-1', name: 'Khoá deliverable', date: '2026-07-17', done: true }, { id: 'blue-ms-2', name: 'Bàn giao khách hàng', date: '2026-07-19', done: false }],
  },
  'campaign-2': {
    deadline: '2026-07-24',
    phases: ['Thiết kế', 'Xây dựng', 'QA'],
    tasks: [
      { id: 'alchemy-wireframe', title: 'Duyệt wireframe', status: 'done', assignee: 'Mai Anh', phase: 0 },
      { id: 'alchemy-qa', title: 'QA responsive và accessibility', status: 'blocked', assignee: 'Nghĩa Nguyễn', phase: 2, dependsOn: ['q-landing'] },
    ],
    milestones: [{ id: 'alchemy-ms-1', name: 'Design lock', date: '2026-07-16', done: true }, { id: 'alchemy-ms-2', name: 'Go live', date: '2026-07-24', done: false }],
  },
  'campaign-3': {
    deadline: '2026-07-28',
    phases: ['Thu thập', 'Follow-up'],
    tasks: [
      { id: 'north-contacts', title: 'Chuẩn hoá contact hội chợ', status: 'in_progress', assignee: 'Quang Võ', phase: 0 },
      { id: 'north-report', title: 'Báo cáo follow-up', status: 'todo', assignee: 'Quang Võ', phase: 1, dependsOn: ['q-lead-review'] },
    ],
    milestones: [{ id: 'north-ms-1', name: 'Phân loại lead', date: '2026-07-20', done: false }, { id: 'north-ms-2', name: 'Báo cáo chuyển đổi', date: '2026-07-28', done: false }],
  },
};

function comparable(value) {
  return safeText(value, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function questMatchesCampaign(quest, campaign) {
  const questProject = comparable(quest?.project);
  const campaignName = comparable(campaign?.name);
  if (questProject && campaignName && (questProject.includes(campaignName) || campaignName.includes(questProject))) return true;
  if (campaignName.includes('nha gia kim')) return questProject.includes('website');
  if (campaignName.includes('hoi cho phuong bac')) return questProject.includes('crm') || questProject.includes('sales') || questProject.includes('hoi cho');
  return false;
}

export function createRealmWarRoomDemoDashboard({ campaign, quests = [], now = new Date('2026-07-17T12:00:00.000Z') } = {}) {
  const selected = campaign || { id: 'campaign-1', name: 'Campaign Rồng Xanh', owner: 'Minh Quân', progress: 78 };
  const blueprint = DEMO_BLUEPRINTS[selected.id] || DEMO_BLUEPRINTS['campaign-1'];
  const phases = blueprint.phases.map((name, index) => ({ id: `${selected.id}-phase-${index}`, name, order: index }));
  const questTasks = quests.filter((quest) => questMatchesCampaign(quest, selected)).map((quest) => ({
    id: quest.id,
    title: quest.title,
    status: quest.status === 'claimed' || quest.status === 'ready' ? 'done' : 'in_progress',
    priority: quest.priority,
    dueLabel: quest.due,
    phaseId: phases[Math.min(1, phases.length - 1)]?.id,
    assignee: { id: comparable(quest.owner).replace(/\s+/g, '-'), name: quest.owner },
    checklist: Array.from({ length: Math.max(0, finite(quest.total, 0)) }, (_, index) => ({ done: index < finite(quest.progress, 0) })),
    realmQuest: { active: true, approvedAt: quest.status === 'ready' || quest.status === 'claimed' ? now : null },
    rewarded: quest.status === 'claimed',
  }));
  const tasks = [
    ...questTasks,
    ...blueprint.tasks.filter((task) => !questTasks.some((quest) => quest.id === task.id)).map((task) => ({
      ...task,
      phaseId: phases[task.phase]?.id,
      assignee: { id: comparable(task.assignee).replace(/\s+/g, '-'), name: task.assignee },
    })),
  ];
  return createRealmWarRoomDashboard({
    source: 'local',
    project: {
      ...selected,
      status: selected.progress >= 100 ? 'done' : 'active',
      deadline: blueprint.deadline,
      autoProgress: true,
    },
    phases,
    tasks,
    milestones: blueprint.milestones,
    generatedAt: now.toISOString(),
    now,
    permissions: { scope: 'team', teamId: 'egoric-company' },
  });
}
