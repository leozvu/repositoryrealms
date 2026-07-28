import { REALM_ERP_BRIDGE_CATALOG, realmRecordHref } from './realm-business-bridge.js';
import { loadRealmCompanyModules, realmRouteDecision } from './realm-access.js';
import { createRealmChronicleDashboard } from './realm-chronicle.js';
import { RealmOperationError } from './realm-operation.js';

function startDay(now, offsetDays) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function portalHref(user, modules, key) {
  const route = REALM_ERP_BRIDGE_CATALOG.find((item) => item.key === key);
  return route && realmRouteDecision(user, route, modules).allowed ? route.href : null;
}

export async function loadRealmChronicle(db, user, now = new Date()) {
  if (!user?.id) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const [dbUser, modules] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, title: true, teamId: true, status: true, userType: true, realmProfile: true },
    }),
    loadRealmCompanyModules(db),
  ]);
  if (!dbUser || dbUser.status !== 'active' || dbUser.userType !== 'employee') {
    throw new RealmOperationError('Hồ sơ nhân sự nội bộ không khả dụng.', 403, 'realm_chronicle_profile_forbidden');
  }
  const links = {
    tasks: portalHref(user, modules, 'tasks'),
    projects: portalHref(user, modules, 'projects'),
    timesheet: portalHref(user, modules, 'timesheet'),
    attendance: portalHref(user, modules, 'attendance'),
    approvals: portalHref(user, modules, 'approvals'),
    profile: portalHref(user, modules, 'staff') ? realmRecordHref('staff', user.id) : null,
  };
  const taskSelect = {
    id: true, title: true, status: true, priority: true, dueDate: true, estHours: true, checklist: true,
    project: { select: { id: true, name: true, status: true, progress: true } },
    realmQuest: { select: { active: true, status: true, approvedAt: true, gold: true, renown: true } },
  };
  const fromDay = startDay(now, -30);
  const untilDay = startDay(now, 90);
  const [team, tasks, timeLogs, leaves, attendance, approvals, entries] = await Promise.all([
    dbUser.teamId ? db.team.findUnique({ where: { id: dbUser.teamId }, select: { id: true, name: true } }) : null,
    db.task.findMany({ where: { assigneeId: user.id }, select: taskSelect, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], take: 100 }),
    db.timeLog.findMany({
      where: { userId: user.id, date: { gte: fromDay } },
      select: { id: true, date: true, hours: true, billable: true, project: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 120,
    }),
    db.leave.findMany({
      where: { userId: user.id, to: { gte: fromDay }, from: { lte: untilDay } },
      select: { id: true, from: true, to: true, type: true, status: true },
      orderBy: [{ from: 'desc' }, { id: 'desc' }], take: 40,
    }),
    db.attendance.findMany({
      where: { userId: user.id, date: { gte: fromDay } },
      select: { id: true, date: true, status: true, checkIn: true, checkOut: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 40,
    }),
    db.approval.findMany({
      where: { requesterId: user.id },
      select: { id: true, type: true, title: true, status: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 60,
    }),
    db.realmGoldEntry.findMany({
      where: { userId: user.id },
      select: { id: true, type: true, amount: true, renown: true, label: true, sourceType: true, sourceId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
    }),
  ]);
  return createRealmChronicleDashboard({
    source: 'erp', generatedAt: now.toISOString(), now,
    user: dbUser, team, profile: dbUser.realmProfile,
    tasks, timeLogs, leaves, attendance, approvals, entries, links,
  });
}
