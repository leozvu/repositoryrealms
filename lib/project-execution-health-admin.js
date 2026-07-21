import { hasAny, isFreelancer } from './perm.js';
import { RealmOperationError } from './realm-operation.js';
import { enrichTasksWithResourceIntelligence } from './resource-intelligence-admin.js';
import { buildProjectExecutionHealth, parseProjectDependencyIds } from './project-execution-health.js';

const ID = /^[a-zA-Z0-9:_-]{1,100}$/;
const OPEN_STATES = ['todo', 'doing', 'waiting', 'review', 'blocked'];

function fail(message, status, code) {
  throw new RealmOperationError(message, status, code);
}

function projectIdOf(value) {
  const id = String(value || '').trim();
  if (!ID.test(id)) fail('Mã Project không hợp lệ.', 400, 'project_execution_project_id_invalid');
  return id;
}

function requireReader(user) {
  if (!user?.id) fail('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) fail('Freelancer không sử dụng Project Execution Health nội bộ.', 403, 'project_execution_freelancer_forbidden');
}

const PROJECT_TASK_SELECT = {
  id: true,
  projectId: true,
  phaseId: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  assigneeId: true,
  estHours: true,
  dependsOn: true,
  workType: true,
  complexity: true,
  workVersion: true,
  blockReason: true,
  waitingReason: true,
  escalationLevel: true,
  completedAt: true,
};

export async function loadProjectExecutionHealth(db, user, projectId, now = new Date(), {
  enricher = enrichTasksWithResourceIntelligence,
} = {}) {
  requireReader(user);
  const id = projectIdOf(projectId);
  const canSeeMoney = hasAny(user, ['ACCOUNTANT', 'PM', 'LEAD']);
  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true, name: true, clientId: true, service: true, budget: true, budgetHours: true,
      status: true, startDate: true, deadline: true, progress: true, autoProgress: true,
      client: { select: { id: true, name: true } },
    },
  });
  if (!project) fail('Không tìm thấy Project.', 404, 'project_execution_not_found');

  const [tasks, timeLogs, phases, milestones, vendorBills, invoices] = await Promise.all([
    db.task.findMany({ where: { projectId: id }, select: PROJECT_TASK_SELECT, orderBy: [{ queuePosition: 'asc' }, { dueDate: 'asc' }], take: 2000 }),
    db.timeLog.findMany({
      where: { projectId: id },
      select: { id: true, taskId: true, projectId: true, userId: true, date: true, hours: true, billable: true, invoiceId: true },
      orderBy: { date: 'desc' },
      take: 10_000,
    }),
    db.phase.findMany({ where: { projectId: id }, select: { id: true, name: true, order: true, color: true }, orderBy: { order: 'asc' } }),
    db.milestone.findMany({ where: { projectId: id }, select: { id: true, name: true, date: true, done: true, note: true }, orderBy: { date: 'asc' } }),
    canSeeMoney ? db.vendorBill.findMany({ where: { projectId: id }, select: { id: true, amount: true, status: true, date: true, dueDate: true } }) : [],
    canSeeMoney ? db.invoice.findMany({
      where: { projectId: id },
      select: { id: true, code: true, items: true, vat: true, payments: true, status: true, date: true, dueDate: true, currency: true, fxRate: true },
    }) : [],
  ]);

  const memberIds = [...new Set([
    ...tasks.map((task) => task.assigneeId),
    ...timeLogs.map((log) => log.userId),
  ].filter(Boolean))];
  const taskIds = new Set(tasks.map((task) => task.id));
  const dependencyIds = [...new Set(tasks.flatMap((task) => parseProjectDependencyIds(task.dependsOn)).filter((dependencyId) => !taskIds.has(dependencyId)))];
  const [resource, users, companyTasks, queueStates, externalDependencies] = await Promise.all([
    enricher(db, tasks),
    memberIds.length ? db.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, name: true, title: true, teamId: true, userType: true, salary: true, hourlyRate: true },
      take: 500,
    }) : [],
    memberIds.length ? db.task.findMany({
      where: { assigneeId: { in: memberIds }, status: { in: OPEN_STATES } },
      select: { id: true, projectId: true, assigneeId: true, status: true, estHours: true },
      take: 5000,
    }) : [],
    memberIds.length ? db.workQueueState.findMany({
      where: { ownerId: { in: memberIds } },
      select: { ownerId: true, version: true, wipLimit: true },
    }) : [],
    dependencyIds.length ? db.task.findMany({
      where: { id: { in: dependencyIds } },
      select: { id: true, title: true, status: true },
      take: 2000,
    }) : [],
  ]);
  const usersById = Object.fromEntries(users.map((entry) => [entry.id, entry]));
  const snapshot = buildProjectExecutionHealth({
    project,
    tasks: resource.tasks,
    companyTasks,
    dependencyTasks: externalDependencies,
    timeLogs,
    usersById,
    queueStates,
    milestones,
    phases,
    vendorBills,
    invoices,
    canSeeMoney,
    today: now.toISOString().slice(0, 10),
  });

  return Object.freeze({
    source: 'canonical-erp-project',
    generatedAt: now.toISOString(),
    canSeeMoney,
    project: Object.freeze({
      id: project.id,
      name: project.name,
      clientId: project.clientId,
      clientName: project.client?.name || null,
      service: project.service,
      status: project.status,
      startDate: project.startDate,
      deadline: project.deadline,
      budgetHours: project.budgetHours,
    }),
    executionHealth: snapshot,
    limits: Object.freeze({
      taskSnapshot: 2000,
      timeLogSnapshot: 10_000,
      taskSnapshotTruncated: tasks.length >= 2000,
      timeLogSnapshotTruncated: timeLogs.length >= 10_000,
    }),
  });
}
