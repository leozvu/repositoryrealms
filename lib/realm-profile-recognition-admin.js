import { COLLABORATION_PRESENCE_TTL_MS } from './collaboration.js';
import { rolesOf } from './perm.js';
import { realmRecordHref } from './realm-business-bridge.js';
import { RealmOperationError } from './realm-operation.js';
import {
  REALM_REWARD_LIMITS,
  realmRewardPeriod,
  realmRewardPeriodRange,
  realmRewardPermissions,
} from './realm-rewards.js';

const OPEN_TASK_STATES = new Set(['todo', 'doing', 'in_progress', 'review', 'blocked']);

function settingObject(row) {
  try { return JSON.parse(row?.json || '{}'); } catch { return {}; }
}

function skillLabels(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean).map(String).slice(0, 20);
    }
  } catch {}
  return String(value).split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function availabilityFrom(sessions, now) {
  const threshold = now.getTime() - COLLABORATION_PRESENCE_TTL_MS;
  const active = sessions
    .filter((row) => new Date(row.lastSeen).getTime() >= threshold)
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())[0];
  return active ? {
    state: active.availability,
    surface: active.surface,
    lastSeen: new Date(active.lastSeen).toISOString(),
    source: 'user-set-presence',
  } : {
    state: 'offline',
    surface: null,
    lastSeen: sessions[0]?.lastSeen ? new Date(sessions[0].lastSeen).toISOString() : null,
    source: 'presence-ttl',
  };
}

function taskOrder(a, b) {
  return Number(a.queuePosition || 0) - Number(b.queuePosition || 0)
    || String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'))
    || a.title.localeCompare(b.title, 'vi');
}

function taskSummary(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    queuePosition: task.queuePosition,
    updatedAt: task.updatedAt?.toISOString?.() || task.updatedAt || null,
    completedAt: task.completedAt?.toISOString?.() || task.completedAt || null,
    project: task.project ? {
      id: task.project.id,
      name: task.project.name,
      status: task.project.status,
      progress: task.project.progress,
      href: realmRecordHref('project', task.project.id),
    } : null,
    href: realmRecordHref('task', task.id),
  };
}

function effectiveBudget(row) {
  const approved = row?.status === 'approved' && row?.approvedAt;
  return {
    status: approved ? 'approved' : 'default-policy',
    companyCap: approved ? row.goldCap : REALM_REWARD_LIMITS.defaultMonthlyGoldCap,
    perUserCap: approved ? row.perUserGoldCap : REALM_REWARD_LIMITS.defaultPerUserGoldCap,
    approvedAt: approved ? row.approvedAt.toISOString() : null,
  };
}

function ledgerStatus(entry) {
  if (entry.type === 'adjustment') return 'correction-posted';
  if (entry.type === 'redemption_hold') return 'reserved';
  if (entry.type === 'redemption_release') return 'released';
  return 'posted';
}

export async function loadRealmProfileRecognition(db, user, now = new Date()) {
  if (!user?.id) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const period = realmRewardPeriod(now);
  const { start, end } = realmRewardPeriodRange(period);
  const [dbUser, settingRow, entries, presenceSessions, budget] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, email: true, name: true, role: true, roles: true, teamId: true, title: true,
        phone: true, status: true, userType: true, workspacePreference: true, skills: true,
        createdAt: true, avatarVersion: true,
        realmProfile: { select: { realmClass: true, color: true, streakDays: true, createdAt: true, updatedAt: true } },
      },
    }),
    db.setting.findUnique({ where: { id: 1 }, select: { json: true } }),
    db.realmGoldEntry.findMany({
      where: { userId: user.id },
      select: { id: true, type: true, amount: true, renown: true, label: true, sourceType: true, sourceId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 250,
    }),
    db.collaborationPresenceSession.findMany({
      where: { userId: user.id },
      select: { availability: true, surface: true, lastSeen: true },
      orderBy: { lastSeen: 'desc' },
      take: 8,
    }),
    db.realmRewardBudget.findUnique({
      where: { period },
      select: { goldCap: true, perUserGoldCap: true, status: true, approvedAt: true },
    }),
  ]);

  if (!dbUser || dbUser.status !== 'active' || dbUser.userType !== 'employee') {
    throw new RealmOperationError('Hồ sơ nhân sự nội bộ không khả dụng.', 403, 'realm_profile_forbidden');
  }

  const sourceTaskIds = entries.filter((entry) => entry.sourceType === 'task' && entry.sourceId).map((entry) => entry.sourceId);
  const [team, tasks] = await Promise.all([
    dbUser.teamId ? db.team.findUnique({ where: { id: dbUser.teamId }, select: { id: true, name: true } }) : null,
    db.task.findMany({
    where: { OR: [{ assigneeId: user.id }, ...(sourceTaskIds.length ? [{ id: { in: sourceTaskIds } }] : [])] },
    select: {
      id: true, title: true, assigneeId: true, status: true, priority: true, dueDate: true,
      queuePosition: true, updatedAt: true, completedAt: true,
      project: { select: { id: true, name: true, status: true, progress: true } },
      realmQuest: {
        select: {
          status: true, gold: true, approvedAt: true,
          configuredBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 240,
    }),
  ]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const ownTasks = tasks.filter((task) => task.assigneeId === user.id);
  const openTasks = ownTasks.filter((task) => OPEN_TASK_STATES.has(task.status)).sort(taskOrder);
  const currentWork = openTasks.find((task) => ['doing', 'in_progress', 'review', 'blocked'].includes(task.status)) || null;
  const nextWork = openTasks.find((task) => task.id !== currentWork?.id) || null;
  const activeProjects = [...new Map(openTasks.filter((task) => task.project).map((task) => [task.project.id, task.project])).values()]
    .slice(0, 8)
    .map((project) => ({ ...project, href: realmRecordHref('project', project.id) }));
  const contributions = ownTasks
    .filter((task) => task.status === 'done')
    .sort((a, b) => String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt)))
    .slice(0, 8)
    .map(taskSummary);

  const policy = effectiveBudget(budget);
  const monthEntries = entries.filter((entry) => entry.createdAt >= start && entry.createdAt < end);
  const receivedThisPeriod = monthEntries.reduce((sum, entry) => sum + (entry.amount > 0 && entry.type !== 'redemption_release' ? entry.amount : 0), 0);
  const spentThisPeriod = monthEntries.reduce((sum, entry) => sum + (entry.amount < 0 && entry.type !== 'redemption_hold' ? Math.abs(entry.amount) : 0), 0);
  const balance = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const issuedTaskIds = new Set(entries.filter((entry) => entry.type === 'quest_reward' && entry.sourceType === 'task' && entry.sourceId).map((entry) => entry.sourceId));
  const pendingRecognition = ownTasks.filter((task) => task.realmQuest?.status === 'approved' && !issuedTaskIds.has(task.id));
  const permissions = realmRewardPermissions(dbUser);
  const settings = settingObject(settingRow);

  return {
    source: 'erp',
    generatedAt: now.toISOString(),
    identity: {
      id: dbUser.id,
      preferredName: dbUser.name,
      pronouns: null,
      title: dbUser.title || 'Nhân sự',
      roles: rolesOf(dbUser),
      team: team ? { id: team.id, name: team.name } : null,
      company: settings.company || 'Agency ERP',
      timeZone: null,
      email: dbUser.email,
      phone: dbUser.phone || null,
      avatarHref: `/api/avatar/${encodeURIComponent(dbUser.id)}?v=${dbUser.avatarVersion || 0}`,
      realmClass: dbUser.realmProfile?.realmClass || dbUser.title || 'Realm Builder',
      realmColor: dbUser.realmProfile?.color || '#4fa47a',
      memberSince: dbUser.createdAt.toISOString(),
      availability: availabilityFrom(presenceSessions, now),
      accessContext: 'self',
    },
    profile: {
      currentWork: currentWork ? taskSummary(currentWork) : null,
      nextWork: nextWork ? taskSummary(nextWork) : null,
      openWorkCount: openTasks.length,
      activeProjects,
      skills: skillLabels(dbUser.skills).map((name) => ({ name, evidenceHref: null, evidenceState: 'not-linked' })),
      contributions,
      preferences: {
        workspace: dbUser.workspacePreference,
        collaboration: 'user-controlled',
      },
      visibility: {
        contact: 'self',
        work: 'authorized-erp-scope',
        skills: 'self-declared-no-evidence',
        sensitiveFields: 'excluded',
      },
    },
    recognition: {
      period,
      summary: {
        balance,
        receivedThisPeriod,
        spentThisPeriod,
        pendingApproved: pendingRecognition.reduce((sum, task) => sum + Number(task.realmQuest?.gold || 0), 0),
        personalPolicyCap: policy.perUserCap,
        personalPolicyRemaining: Math.max(0, policy.perUserCap - receivedThisPeriod),
      },
      policy: {
        ...policy,
        recognitionUnit: true,
        payrollEffect: false,
        rankingEffect: false,
        appendOnly: true,
      },
      permissions: {
        canOpenRewardControl: permissions.canView,
        canConfigure: permissions.canConfigure,
        canApprove: permissions.canApprove,
        canManageBudget: permissions.canManageBudget,
      },
      ledger: entries.map((entry) => {
        const task = entry.sourceType === 'task' ? taskById.get(entry.sourceId) : null;
        const configuredBy = task?.realmQuest?.configuredBy || null;
        const approvedBy = task?.realmQuest?.approvedBy || null;
        return {
          id: entry.id,
          date: entry.createdAt.toISOString(),
          type: entry.type,
          from: configuredBy ? { id: configuredBy.id, name: configuredBy.name } : { id: null, name: 'RepositoryRealms' },
          to: { id: dbUser.id, name: dbUser.name },
          reason: entry.label,
          contribution: task ? { id: task.id, title: task.title, href: realmRecordHref('task', task.id) } : null,
          project: task?.project ? { id: task.project.id, name: task.project.name, href: realmRecordHref('project', task.project.id) } : null,
          source: { type: entry.sourceType || 'ledger', id: entry.sourceId || entry.id },
          approver: approvedBy ? { id: approvedBy.id, name: approvedBy.name } : null,
          policy: { period, status: policy.status, personalCap: policy.perUserCap },
          amount: entry.amount,
          renown: entry.renown,
          receipt: { id: entry.id, type: 'realm-gold-entry' },
          status: ledgerStatus(entry),
          compensatingCorrection: entry.type === 'adjustment',
        };
      }),
    },
    links: {
      canonicalProfile: realmRecordHref('staff', dbUser.id),
      tasks: '/tasks',
      projects: '/projects',
      messages: '/messages',
      calendar: '/calendar',
      settings: '/settings',
      chronicle: '/realm?view=ledger',
      rewardControl: permissions.canView ? '/realm?view=ledger' : null,
    },
    privacy: {
      scope: 'self',
      excluded: ['salary', 'hourlyRate', 'reviewScores', 'managerNotes', 'privateNotes'],
      performanceRanking: false,
      inferredMood: false,
    },
  };
}
