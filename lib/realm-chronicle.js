import { createRealmInventory } from './realm-inventory.js';

const OPEN_STATUSES = new Set(['todo', 'doing', 'in_progress', 'review', 'blocked']);
const PROFILE_COLOR = /^#[0-9a-f]{6}$/i;
const DAY_MS = 86_400_000;

const cleanText = (value, fallback = '', max = 180) => {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, max);
};

const safeId = (value, fallback = 'unknown') => cleanText(value, fallback, 100).replace(/[^a-zA-Z0-9:_-]/g, '-');
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const roundOne = (value) => Math.round(finite(value) * 10) / 10;
const isoDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
const dayTime = (value) => {
  const day = isoDay(value);
  if (!day) return null;
  const parsed = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
};

function safeArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function questProgress(task) {
  const checklist = safeArray(task?.checklist);
  if (!checklist.length) return { progress: task?.status === 'done' ? 1 : 0, total: 1 };
  return {
    progress: task?.status === 'done' ? checklist.length : checklist.filter((item) => item?.done === true).length,
    total: checklist.length,
  };
}

function careerFromTotals({ renown = 0, wallet = 0, completedQuests = 0, streakDays = 0 } = {}) {
  renown = Math.max(0, finite(renown));
  const level = 11 + Math.max(0, Math.floor((renown - 1000) / 250));
  const floor = 1000 + Math.max(0, level - 11) * 250;
  const nextLevelRenown = floor + 250;
  return {
    wallet: finite(wallet),
    renown,
    level,
    nextLevelRenown,
    levelProgress: Math.max(0, Math.min(100, Math.round(((renown - floor) / 250) * 100))),
    completedQuests,
    streakDays: Math.max(0, Math.round(finite(streakDays))),
  };
}

function careerFor(entries, completedQuests, streakDays) {
  return careerFromTotals({
    wallet: entries.reduce((sum, entry) => sum + finite(entry?.amount), 0),
    renown: entries.reduce((sum, entry) => sum + Math.max(0, finite(entry?.renown)), 0),
    completedQuests,
    streakDays,
  });
}

function approvalHref(row, links) {
  if (!links?.approvals) return null;
  const id = safeId(row?.id, '');
  return id ? `${links.approvals}?focus=${encodeURIComponent(id)}&from=realm` : links.approvals;
}

function taskHref(taskId, links) {
  if (!links?.tasks) return null;
  return `${links.tasks}?focus=${encodeURIComponent(safeId(taskId))}&from=realm`;
}

function normalizeTimeline({ entries, timeLogs, leaves, approvals, links }) {
  const events = [];
  for (const entry of entries.slice(0, 30)) {
    events.push({
      id: `gold:${safeId(entry?.id)}`,
      at: entry?.createdAt ? new Date(entry.createdAt).toISOString() : null,
      kind: 'gold',
      icon: 'wallet',
      title: cleanText(entry?.label, 'Biến động Gold'),
      detail: `${finite(entry?.amount) >= 0 ? '+' : ''}${finite(entry?.amount)} Gold${finite(entry?.renown) > 0 ? ` · +${finite(entry.renown)} Renown` : ''}`,
      href: null,
    });
  }
  for (const log of timeLogs.slice(0, 30)) {
    const day = isoDay(log?.date);
    events.push({
      id: `time:${safeId(log?.id)}`,
      at: day ? `${day}T12:00:00.000Z` : null,
      kind: 'time',
      icon: 'clock',
      title: `Đã ghi ${roundOne(log?.hours)} giờ`,
      detail: cleanText(log?.project?.name, 'Công việc nội bộ'),
      href: links?.timesheet || null,
    });
  }
  for (const leave of leaves.slice(0, 20)) {
    const day = isoDay(leave?.from);
    events.push({
      id: `leave:${safeId(leave?.id)}`,
      at: day ? `${day}T11:00:00.000Z` : null,
      kind: 'leave',
      icon: 'calendar',
      title: leave?.status === 'approved' ? 'Lịch nghỉ đã được duyệt' : leave?.status === 'rejected' ? 'Yêu cầu nghỉ đã được phản hồi' : 'Yêu cầu nghỉ đang chờ duyệt',
      detail: `${day || 'Chưa rõ ngày'}${leave?.to && leave.to !== day ? ` → ${leave.to}` : ''}`,
      href: links?.attendance || null,
    });
  }
  for (const approval of approvals.slice(0, 20)) {
    events.push({
      id: `approval:${safeId(approval?.id)}`,
      at: approval?.createdAt ? new Date(approval.createdAt).toISOString() : null,
      kind: 'approval',
      icon: 'shield',
      title: cleanText(approval?.title, 'Yêu cầu phê duyệt'),
      detail: approval?.status === 'approved' ? 'Đã duyệt' : approval?.status === 'rejected' ? 'Đã từ chối' : 'Đang chờ hội đồng',
      href: approvalHref(approval, links),
    });
  }
  return events
    .filter((event) => event.at && !Number.isNaN(new Date(event.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || a.id.localeCompare(b.id))
    .slice(0, 16);
}

export function createRealmChronicleDashboard({
  source = 'local',
  generatedAt = new Date().toISOString(),
  user = {},
  team = null,
  profile = null,
  tasks = [],
  timeLogs = [],
  leaves = [],
  attendance = [],
  approvals = [],
  entries = [],
  links = {},
  now = new Date(),
} = {}) {
  const nowTime = now.getTime();
  const today = now.toISOString().slice(0, 10);
  const weekStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - ((weekStartDate.getUTCDay() + 6) % 7));
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const horizonTime = nowTime + 7 * DAY_MS;
  const { loadout, inventory } = createRealmInventory(entries);

  const questRows = tasks.map((task, index) => {
    const id = safeId(task?.id, `task-${index + 1}`);
    const dueTime = dayTime(task?.dueDate);
    const status = cleanText(task?.status, 'todo', 30);
    const progress = questProgress(task);
    const reward = task?.realmQuest;
    const rewardApproved = Boolean(reward?.active && reward?.status === 'approved' && reward?.approvedAt && finite(reward?.gold) > 0);
    return {
      id,
      title: cleanText(task?.title, 'Quest chưa đặt tên'),
      status,
      priority: ['low', 'medium', 'high', 'urgent'].includes(task?.priority) ? task.priority : 'medium',
      dueDate: isoDay(task?.dueDate),
      overdue: OPEN_STATUSES.has(status) && dueTime !== null && dueTime < nowTime,
      dueSoon: OPEN_STATUSES.has(status) && dueTime !== null && dueTime >= nowTime && dueTime <= horizonTime,
      estHours: Math.max(0, roundOne(task?.estHours)),
      ...progress,
      project: task?.project?.id ? {
        id: safeId(task.project.id),
        name: cleanText(task.project.name, 'Chiến dịch'),
        status: cleanText(task.project.status, 'active', 30),
        progress: Math.max(0, Math.min(100, Math.round(finite(task.project.progress)))),
        href: links?.projects ? `${links.projects}/${encodeURIComponent(safeId(task.project.id))}` : null,
      } : null,
      reward: rewardApproved ? { gold: Math.max(0, Math.round(finite(reward.gold))), renown: Math.max(0, Math.round(finite(reward.renown))) } : null,
      href: taskHref(id, links),
    };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue)
    || Number(b.dueSoon) - Number(a.dueSoon)
    || (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
    || a.title.localeCompare(b.title, 'vi'));

  const campaignMap = new Map();
  for (const quest of questRows) {
    if (!quest.project) continue;
    const row = campaignMap.get(quest.project.id) || { ...quest.project, quests: 0, openQuests: 0, dueSoon: 0, overdue: 0 };
    row.quests += 1;
    row.openQuests += Number(OPEN_STATUSES.has(quest.status));
    row.dueSoon += Number(quest.dueSoon);
    row.overdue += Number(quest.overdue);
    campaignMap.set(quest.project.id, row);
  }
  const campaigns = [...campaignMap.values()].sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon || a.name.localeCompare(b.name, 'vi')).slice(0, 8);

  const weekLogs = timeLogs.filter((log) => isoDay(log?.date) && log.date >= weekStart && log.date <= today);
  const loggedHours = roundOne(weekLogs.reduce((sum, log) => sum + Math.max(0, finite(log?.hours)), 0));
  const trackedDays = new Set(weekLogs.map((log) => log.date)).size;
  const currentAttendance = attendance.find((row) => row?.date === today) || null;
  const nextLeave = leaves
    .filter((leave) => leave?.status !== 'rejected' && isoDay(leave?.to) && leave.to >= today)
    .sort((a, b) => a.from.localeCompare(b.from))[0] || null;
  const pendingApprovals = approvals.filter((approval) => approval?.status === 'pending');
  const openQuests = questRows.filter((quest) => OPEN_STATUSES.has(quest.status));
  const completedQuests = questRows.filter((quest) => quest.status === 'done').length;
  const career = careerFor(entries, completedQuests, profile?.streakDays);

  return {
    source: source === 'erp' ? 'erp' : 'local',
    generatedAt: cleanText(generatedAt, now.toISOString(), 40),
    identity: {
      id: safeId(user?.id, 'adventurer'),
      name: cleanText(user?.name, 'Adventurer', 100),
      title: cleanText(user?.title, 'Guild member', 100),
      realmClass: cleanText(profile?.realmClass || user?.title, 'Realm Builder', 80),
      color: PROFILE_COLOR.test(profile?.color || '') ? profile.color.toLowerCase() : '#52745f',
      team: team?.id ? { id: safeId(team.id), name: cleanText(team.name, 'Guild', 100) } : null,
      loadout,
      inventoryCount: inventory.length,
    },
    career,
    metrics: {
      openQuests: openQuests.length,
      dueSoonQuests: openQuests.filter((quest) => quest.dueSoon).length,
      overdueQuests: openQuests.filter((quest) => quest.overdue).length,
      loggedHours,
      trackedDays,
      pendingApprovals: pendingApprovals.length,
      activeCampaigns: campaigns.filter((campaign) => campaign.status !== 'done').length,
    },
    muster: {
      today: currentAttendance ? {
        status: cleanText(currentAttendance.status, 'present', 30),
        checkIn: cleanText(currentAttendance.checkIn, '', 10) || null,
        checkOut: cleanText(currentAttendance.checkOut, '', 10) || null,
      } : null,
      nextLeave: nextLeave ? {
        id: safeId(nextLeave.id),
        from: isoDay(nextLeave.from),
        to: isoDay(nextLeave.to),
        type: cleanText(nextLeave.type, 'annual', 30),
        status: cleanText(nextLeave.status, 'pending', 30),
        href: links?.attendance || null,
      } : null,
      attendanceHref: links?.attendance || null,
      timesheetHref: links?.timesheet || null,
    },
    quests: questRows.slice(0, 16),
    campaigns,
    approvals: pendingApprovals.slice(0, 8).map((approval) => ({
      id: safeId(approval.id),
      title: cleanText(approval.title, 'Yêu cầu phê duyệt'),
      type: cleanText(approval.type, 'request', 30),
      createdAt: approval.createdAt ? new Date(approval.createdAt).toISOString() : null,
      href: approvalHref(approval, links),
    })),
    timeline: normalizeTimeline({ entries, timeLogs, leaves, approvals, links }),
    links: {
      tasks: links?.tasks || null,
      projects: links?.projects || null,
      timesheet: links?.timesheet || null,
      attendance: links?.attendance || null,
      approvals: links?.approvals || null,
      profile: links?.profile || null,
    },
    privacy: {
      scope: 'self',
      performanceRanking: false,
      sensitiveFieldsExcluded: ['salary', 'hourlyRate', 'reviewScores', 'managerNotes', 'privateNotes'],
      sourceOfTruth: 'erp-records',
      capacityNote: 'Giờ đã ghi và lịch cá nhân chỉ hiển thị cho chính chủ; không dùng để xếp hạng.',
    },
  };
}

export function createRealmChronicleDemoDashboard({ profile = {}, career = {}, quests = [], ledger = [], wallet = null } = {}) {
  const now = new Date('2026-07-18T12:00:00.000Z');
  const tasks = quests.map((quest, index) => ({
    id: quest.businessRef || quest.id || `demo-task-${index + 1}`,
    title: quest.title,
    status: quest.status === 'claimed' ? 'done' : quest.status === 'ready' ? 'review' : 'doing',
    priority: String(quest.priority || '').toLowerCase().includes('epic') ? 'high' : 'medium',
    dueDate: index === 0 ? '2026-07-20' : index === 1 ? '2026-07-24' : null,
    estHours: Math.max(1, finite(quest.total, 2)),
    checklist: JSON.stringify(Array.from({ length: Math.max(1, finite(quest.total, 1)) }, (_, itemIndex) => ({ done: itemIndex < finite(quest.progress) }))),
    project: { id: `demo-project-${(index % 2) + 1}`, name: quest.project || 'Demo campaign', status: 'active', progress: index % 2 ? 46 : 78 },
    realmQuest: quest.reward > 0 ? { active: true, status: 'approved', approvedAt: now, gold: quest.reward, renown: quest.renown || 0 } : null,
  }));
  const entries = ledger.map((entry, index) => ({
    id: entry.id || `demo-entry-${index + 1}`,
    amount: entry.amount,
    renown: entry.renown || 0,
    type: entry.type || 'quest_reward',
    label: entry.label,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    createdAt: new Date(now.getTime() - index * DAY_MS),
  }));
  const dashboard = createRealmChronicleDashboard({
    source: 'local', generatedAt: now.toISOString(), now,
    user: { id: 'demo-adventurer', name: profile.name || 'Adventurer Zero', title: 'Realm Product Builder' },
    team: { id: 'demo-guild', name: 'Guild Sản phẩm' },
    profile: { realmClass: profile.role || 'Realm Builder', color: profile.color, streakDays: career.streakDays || 4 },
    tasks,
    timeLogs: [
      { id: 'demo-time-1', date: '2026-07-18', hours: 3.5, project: { name: 'Campaign Rồng Xanh' } },
      { id: 'demo-time-2', date: '2026-07-17', hours: 5, project: { name: 'Website Nhà Giả Kim' } },
    ],
    leaves: [{ id: 'demo-leave-1', from: '2026-07-28', to: '2026-07-28', type: 'annual', status: 'approved' }],
    attendance: [{ id: 'demo-attendance-1', date: '2026-07-18', status: 'remote', checkIn: '08:55', checkOut: null }],
    approvals: [{ id: 'demo-approval-1', type: 'task_handoff', title: 'Bàn giao checklist QA', status: 'pending', createdAt: new Date('2026-07-18T09:00:00.000Z') }],
    entries,
    links: { tasks: '/tasks', projects: '/projects', timesheet: '/timesheet', attendance: '/attendance', approvals: '/approvals', profile: '/staff' },
  });
  return {
    ...dashboard,
    career: careerFromTotals({
      wallet: wallet === null ? dashboard.career.wallet : wallet,
      renown: career.renown ?? dashboard.career.renown,
      completedQuests: career.completedQuests ?? dashboard.career.completedQuests,
      streakDays: career.streakDays ?? dashboard.career.streakDays,
    }),
  };
}
