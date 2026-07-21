import { buildHrEvidenceOutcomeIntelligence, currentQuarter, quarterWindow } from './hr-evidence-outcome-intelligence.js';
import { hasAny, isFreelancer, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-operation.js';

function fail(message, status, code) {
  throw new RealmOperationError(message, status, code);
}

export function hrEvidenceIntelligenceScope(user) {
  if (!user?.id) return { kind: 'none', code: 'unauthorized', canValidate: false };
  if (isFreelancer(user)) return { kind: 'none', code: 'hr_evidence_freelancer_forbidden', canValidate: false };
  if (hasAny(user, ['HR'])) return { kind: 'company', canValidate: true };
  const roles = rolesOf(user);
  if (roles.some((role) => ['PM', 'LEAD'].includes(role)) && user.teamId) {
    return { kind: 'team', teamId: user.teamId, canValidate: true };
  }
  return { kind: 'self', userId: user.id, canValidate: false };
}

export async function loadHrEvidenceOutcomeIntelligence(db, user, now = new Date()) {
  const scope = hrEvidenceIntelligenceScope(user);
  if (scope.code === 'unauthorized') fail('Bạn cần đăng nhập ERP.', 401, scope.code);
  if (scope.kind === 'none') fail('Freelancer không được truy cập hồ sơ evidence HR nội bộ.', 403, scope.code);

  const quarter = currentQuarter(now);
  const window = quarterWindow(quarter);
  const personWhere = scope.kind === 'company'
    ? { status: 'active', userType: 'employee' }
    : scope.kind === 'team'
      ? { teamId: scope.teamId, status: 'active', userType: 'employee' }
      : { id: scope.userId, status: 'active', userType: 'employee' };
  const people = await db.user.findMany({
    where: personWhere,
    select: { id: true, name: true, title: true, teamId: true, status: true, userType: true },
    orderBy: { name: 'asc' },
    take: 5000,
  });
  const personIds = people.map((person) => person.id);
  if (!personIds.length) {
    return Object.freeze({
      source: 'canonical-erp-hr',
      generatedAt: now.toISOString(),
      scope: Object.freeze(scope),
      hrEvidenceIntelligence: buildHrEvidenceOutcomeIntelligence({ quarter, scope, today: now.toISOString().slice(0, 10) }),
      limits: Object.freeze({ peopleSnapshot: 5000, peopleSnapshotTruncated: false }),
    });
  }

  const [attendance, timeLogs, tasks, okrs, reviews] = await Promise.all([
    db.attendance.findMany({
      where: { userId: { in: personIds }, date: { gte: window.startDate, lt: window.endDateExclusive } },
      select: { id: true, userId: true, date: true, status: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: 50_000,
    }),
    db.timeLog.findMany({
      where: { userId: { in: personIds }, date: { gte: window.startDate, lt: window.endDateExclusive } },
      select: { id: true, userId: true, taskId: true, date: true, hours: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: 50_000,
    }),
    db.task.findMany({
      where: {
        assigneeId: { in: personIds },
        status: 'done',
        OR: [
          { completedAt: { gte: window.start, lt: window.end } },
          { completedAt: null, updatedAt: { gte: window.start, lt: window.end } },
        ],
      },
      select: { id: true, assigneeId: true, status: true, completedAt: true, updatedAt: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 50_000,
    }),
    db.okr.findMany({
      where: { userId: { in: personIds }, quarter },
      select: { id: true, userId: true, quarter: true, target: true, current: true },
      orderBy: { id: 'asc' },
      take: 10_000,
    }),
    db.review.findMany({
      where: { userId: { in: personIds }, quarter },
      select: { id: true, userId: true, quarter: true, status: true },
      orderBy: { id: 'asc' },
      take: 5000,
    }),
  ]);
  const taskIds = tasks.map((task) => task.id);
  const workEvents = taskIds.length ? await db.workItemEvent.findMany({
    where: { taskId: { in: taskIds }, occurredAt: { gte: window.start, lt: window.end } },
    select: { id: true, taskId: true, action: true, toState: true, receiptId: true, occurredAt: true },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    take: 100_000,
  }) : [];

  return Object.freeze({
    source: 'canonical-erp-hr',
    generatedAt: now.toISOString(),
    scope: Object.freeze({ kind: scope.kind, canValidate: scope.canValidate, teamId: scope.teamId || null }),
    hrEvidenceIntelligence: buildHrEvidenceOutcomeIntelligence({
      people,
      attendance,
      timeLogs,
      tasks,
      workEvents,
      okrs,
      reviews,
      quarter,
      today: now.toISOString().slice(0, 10),
      scope,
    }),
    limits: Object.freeze({
      peopleSnapshot: 5000,
      attendanceSnapshot: 50_000,
      timeLogSnapshot: 50_000,
      taskSnapshot: 50_000,
      workEventSnapshot: 100_000,
      okrSnapshot: 10_000,
      reviewSnapshot: 5000,
      peopleSnapshotTruncated: people.length >= 5000,
      attendanceSnapshotTruncated: attendance.length >= 50_000,
      timeLogSnapshotTruncated: timeLogs.length >= 50_000,
      taskSnapshotTruncated: tasks.length >= 50_000,
      workEventSnapshotTruncated: workEvents.length >= 100_000,
      okrSnapshotTruncated: okrs.length >= 10_000,
      reviewSnapshotTruncated: reviews.length >= 5000,
    }),
  });
}
