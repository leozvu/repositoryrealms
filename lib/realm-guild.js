const PRESENCE = new Set(['available', 'busy', 'focus', 'dnd', 'offline', 'unknown']);
const HEALTH = new Set(['stable', 'attention', 'critical', 'completed']);

const safeText = (value, fallback = '', max = 120) => {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, max);
};
const safeId = (value, fallback = 'unknown') => safeText(value, fallback, 100).replace(/[^a-zA-Z0-9:_-]/g, '-');
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dateValue = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
};

function campaignHealth({ status, progress, overdueTasks }) {
  if (['done', 'completed', 'archived'].includes(status) || progress >= 100) return 'completed';
  if (overdueTasks > 0) return 'critical';
  if (progress < 45) return 'attention';
  return 'stable';
}

function normalizeMember(member, index) {
  const presence = PRESENCE.has(member?.presence) ? member.presence : 'unknown';
  return {
    id: safeId(member?.id, `guild-member-${index}`),
    name: safeText(member?.name, 'Adventurer'),
    title: safeText(member?.title || member?.role, 'Guild Member'),
    realmClass: safeText(member?.realmClass || member?.role, 'Realm Builder'),
    color: /^#[0-9a-f]{6}$/i.test(member?.color || '') ? member.color.toLowerCase() : '#52745f',
    isLead: member?.isLead === true,
    presence,
    statusText: safeText(member?.statusText, presence === 'unknown' ? 'Chưa ghép phiên Realm' : 'Đang hiện diện trong Realm'),
    currentProject: safeText(member?.currentProject, 'Chưa có chiến dịch đang mở'),
    openQuests: Math.max(0, Math.round(finite(member?.openQuests, 0))),
    readyQuests: Math.max(0, Math.round(finite(member?.readyQuests, 0))),
  };
}

function normalizeCampaign(campaign, index) {
  const progress = clamp(Math.round(finite(campaign?.progress, 0)), 0, 100);
  const health = HEALTH.has(campaign?.health)
    ? campaign.health
    : campaignHealth({ status: campaign?.status, progress, overdueTasks: finite(campaign?.overdueTasks, 0) });
  return {
    id: safeId(campaign?.id, `guild-campaign-${index}`),
    name: safeText(campaign?.name, 'Chiến dịch chưa đặt tên'),
    status: safeText(campaign?.status, 'active', 30),
    progress,
    health,
    owner: safeText(campaign?.owner, 'Guild Council'),
    totalTasks: Math.max(0, Math.round(finite(campaign?.totalTasks, 0))),
    doneTasks: Math.max(0, Math.round(finite(campaign?.doneTasks, 0))),
    activeTasks: Math.max(0, Math.round(finite(campaign?.activeTasks, 0))),
    overdueTasks: Math.max(0, Math.round(finite(campaign?.overdueTasks, 0))),
    nextDue: safeText(campaign?.nextDue, 'Chưa có hạn gần nhất', 40),
  };
}

export function createRealmGuildDashboard({
  source = 'local',
  guild = {},
  members = [],
  campaigns = [],
  generatedAt = new Date().toISOString(),
  permissions = {},
} = {}) {
  const normalizedMembers = members.map(normalizeMember).sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name, 'vi'));
  const normalizedCampaigns = campaigns.map(normalizeCampaign);
  const totalCriteria = normalizedCampaigns.reduce((sum, item) => sum + item.totalTasks, 0);
  const doneCriteria = normalizedCampaigns.reduce((sum, item) => sum + item.doneTasks, 0);
  return {
    source: source === 'erp' ? 'erp' : 'local',
    generatedAt: safeText(generatedAt, new Date().toISOString(), 40),
    guild: {
      id: safeId(guild?.id, 'independent-adventurers'),
      name: safeText(guild?.name, 'Independent Adventurers'),
      lead: guild?.lead ? {
        id: safeId(guild.lead.id, 'guild-lead'),
        name: safeText(guild.lead.name, 'Guild Council'),
        title: safeText(guild.lead.title, 'Guild Lead'),
      } : null,
      charter: safeText(guild?.charter, 'Phối hợp công việc theo dữ liệu ERP; không xếp hạng con người bằng Gold.'),
    },
    metrics: {
      members: normalizedMembers.length,
      present: normalizedMembers.filter((member) => !['offline', 'unknown'].includes(member.presence)).length,
      focus: normalizedMembers.filter((member) => member.presence === 'focus').length,
      openQuests: normalizedMembers.reduce((sum, member) => sum + member.openQuests, 0),
      readyQuests: normalizedMembers.reduce((sum, member) => sum + member.readyQuests, 0),
      activeCampaigns: normalizedCampaigns.filter((campaign) => campaign.health !== 'completed').length,
      completionPercent: totalCriteria
        ? Math.round((doneCriteria / totalCriteria) * 100)
        : normalizedCampaigns.length
          ? Math.round(normalizedCampaigns.reduce((sum, item) => sum + item.progress, 0) / normalizedCampaigns.length)
          : 0,
    },
    members: normalizedMembers,
    campaigns: normalizedCampaigns,
    permissions: {
      scope: permissions?.scope === 'company' ? 'company' : permissions?.scope === 'team' ? 'team' : 'self',
      teamId: permissions?.teamId ? safeId(permissions.teamId) : null,
      readOnly: true,
      performanceRanking: false,
    },
  };
}

export function mergeRealmGuildPresence(dashboard, people = []) {
  const byId = new Map();
  const byName = new Map();
  for (const person of people) {
    if (person?.id) byId.set(String(person.id), person);
    if (person?.name) byName.set(String(person.name).trim().toLocaleLowerCase('vi'), person);
  }
  return createRealmGuildDashboard({
    ...dashboard,
    members: dashboard?.members?.map((member) => {
      const live = byId.get(member.id) || byName.get(member.name.toLocaleLowerCase('vi'));
      if (!live || !PRESENCE.has(live.status)) return member;
      return {
        ...member,
        presence: live.status,
        statusText: safeText(live.statusText, 'Đang hiện diện trong Realm'),
        color: /^#[0-9a-f]{6}$/i.test(live.color || '') ? live.color : member.color,
      };
    }) || [],
  });
}

export function createRealmGuildDemoDashboard({ members = [], quests = [], campaigns = [] } = {}) {
  const memberRows = members.map((member) => {
    const ownedQuests = quests.filter((quest) => quest.owner === member.name);
    return {
      ...member,
      title: member.role,
      realmClass: member.role,
      presence: PRESENCE.has(member.status) ? member.status : 'unknown',
      isLead: member.name === 'Minh Quân',
      currentProject: ownedQuests.find((quest) => quest.status !== 'claimed')?.project || member.statusText,
      openQuests: ownedQuests.filter((quest) => quest.status !== 'claimed').length,
      readyQuests: ownedQuests.filter((quest) => quest.status === 'ready').length,
    };
  });
  const campaignRows = campaigns.map((campaign, index) => {
    const related = quests.filter((quest) => quest.project === campaign.name || campaign.name.includes(quest.project));
    return {
      id: `campaign-${index + 1}`,
      ...campaign,
      health: String(campaign.health || '').includes('Cần') ? 'attention' : campaign.progress >= 100 ? 'completed' : 'stable',
      status: campaign.progress >= 100 ? 'done' : 'active',
      totalTasks: 100,
      doneTasks: clamp(Math.round(finite(campaign.progress, 0)), 0, 100),
      activeTasks: related.filter((quest) => quest.status === 'active').length,
      overdueTasks: 0,
      nextDue: related[0]?.due || 'Theo kế hoạch chiến dịch',
    };
  });
  return createRealmGuildDashboard({
    source: 'local',
    guild: {
      id: 'egoric-company',
      name: 'Egoric Adventurers Guild',
      lead: { id: 'minh-quan', name: 'Minh Quân', title: 'Guild Lead' },
      charter: 'Sổ bộ dùng cho phối hợp chiến dịch; Gold và Renown không phải điểm chấm hiệu suất nhân sự.',
    },
    members: memberRows,
    campaigns: campaignRows,
    generatedAt: '2026-07-17T12:00:00.000Z',
    permissions: { scope: 'team', teamId: 'egoric-company' },
  });
}

export function serializeRealmGuildDashboard({ team, members = [], tasks = [], rewardedSourceIds = new Set(), now = new Date(), scope = null } = {}) {
  const taskRows = tasks.map((task) => ({ ...task, rewarded: rewardedSourceIds.has(task.id) }));
  const memberRows = members.map((member) => {
    const owned = taskRows.filter((task) => task.assigneeId === member.id);
    const open = owned.filter((task) => task.status !== 'done');
    const ready = owned.filter((task) => task.status === 'done' && task.realmQuest?.active && task.realmQuest?.approvedAt && !task.rewarded);
    return {
      id: member.id,
      name: member.name,
      title: member.title || 'Guild Member',
      realmClass: member.realmProfile?.realmClass || member.title || 'Realm Builder',
      color: member.realmProfile?.color,
      isLead: team?.leadId === member.id,
      presence: 'unknown',
      statusText: 'Chưa ghép phiên Realm đang hoạt động',
      currentProject: open.find((task) => task.project)?.project?.name || 'Chưa có chiến dịch đang mở',
      openQuests: open.length,
      readyQuests: ready.length,
    };
  });
  const projectMap = new Map();
  for (const task of taskRows) {
    if (!task.project) continue;
    const row = projectMap.get(task.project.id) || { project: task.project, tasks: [] };
    row.tasks.push(task);
    projectMap.set(task.project.id, row);
  }
  const campaignRows = [...projectMap.values()].map(({ project, tasks: projectTasks }) => {
    const doneTasks = projectTasks.filter((task) => task.status === 'done').length;
    const activeTasks = projectTasks.length - doneTasks;
    const overdue = projectTasks.filter((task) => task.status !== 'done' && dateValue(task.dueDate) !== null && dateValue(task.dueDate) < now.getTime());
    const dueDates = projectTasks.map((task) => dateValue(task.dueDate)).filter((value) => value !== null && value >= now.getTime()).sort((a, b) => a - b);
    const progress = Number.isFinite(Number(project.progress))
      ? Number(project.progress)
      : projectTasks.length ? Math.round((doneTasks / projectTasks.length) * 100) : 0;
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      progress,
      owner: memberRows.find((member) => member.isLead)?.name || 'Guild Council',
      totalTasks: projectTasks.length,
      doneTasks,
      activeTasks,
      overdueTasks: overdue.length,
      nextDue: dueDates[0] ? new Date(dueDates[0]).toISOString().slice(0, 10) : 'Chưa có hạn gần nhất',
    };
  });
  const lead = memberRows.find((member) => member.isLead);
  return createRealmGuildDashboard({
    source: 'erp',
    guild: {
      id: team?.id || 'independent-adventurers',
      name: team?.name || 'Independent Adventurers',
      lead: lead ? { id: lead.id, name: lead.name, title: lead.title } : null,
    },
    members: memberRows,
    campaigns: campaignRows,
    generatedAt: now.toISOString(),
    permissions: {
      scope: scope === 'company' ? 'company' : team?.id ? 'team' : 'self',
      teamId: scope === 'company' ? null : team?.id || null,
    },
  });
}
