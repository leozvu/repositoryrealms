import { docGrand, paidOf, hourRate } from './format.js';

export const PROJECT_EXECUTION_HEALTH_RULE_VERSION = 'project-execution-health-v1';

const TERMINAL = new Set(['done', 'merged']);
const OPEN = new Set(['todo', 'doing', 'waiting', 'review', 'blocked']);
const WIP = new Set(['doing', 'waiting', 'review', 'blocked']);
const SEVERITY = { critical: 0, attention: 1, info: 2 };

function round(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return 0;
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function percent(numerator, denominator) {
  if (!(Number(denominator) > 0) || !Number.isFinite(Number(numerator))) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100);
}

function isoDay(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function daysBetween(from, to) {
  const start = isoDay(from);
  const end = isoDay(to);
  if (!start || !end) return null;
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86_400_000);
}

export function parseProjectDependencyIds(value) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value || '[]');
    return [...new Set(parsed.map((item) => String(item || '').trim()).filter((item) => /^[a-zA-Z0-9:_-]{1,100}$/.test(item)))];
  } catch {
    return [];
  }
}

function actualHoursOf(task, loggedByTask) {
  const intelligence = Number(task?.intelligence?.actual?.hours);
  if (Number.isFinite(intelligence) && intelligence >= 0) return intelligence;
  return loggedByTask.get(task.id) || 0;
}

function progressOf(tasks) {
  if (!tasks.length) return { percent: 0, completed: 0, total: 0, basis: 'empty' };
  const completed = tasks.filter((task) => TERMINAL.has(String(task.status))).length;
  const totalEstimate = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.estHours) || 0), 0);
  if (totalEstimate > 0) {
    const completedEstimate = tasks.filter((task) => TERMINAL.has(String(task.status)))
      .reduce((sum, task) => sum + Math.max(0, Number(task.estHours) || 0), 0);
    return { percent: percent(completedEstimate, totalEstimate) || 0, completed, total: tasks.length, basis: 'task_estimate' };
  }
  return { percent: percent(completed, tasks.length) || 0, completed, total: tasks.length, basis: 'task_count' };
}

function scheduleOf(project, progress, today) {
  const daysRemaining = daysBetween(today, project.deadline);
  const totalDays = daysBetween(project.startDate, project.deadline);
  const elapsedDays = daysBetween(project.startDate, today);
  const expectedPercent = totalDays != null && totalDays > 0 && elapsedDays != null
    ? Math.max(0, Math.min(100, percent(elapsedDays, totalDays) || 0))
    : null;
  return {
    deadline: isoDay(project.deadline),
    daysRemaining,
    expectedPercent,
    progressGapPercent: expectedPercent == null ? null : progress.percent - expectedPercent,
  };
}

function dependencyCycles(tasks) {
  const ids = new Set(tasks.map((task) => task.id));
  const edges = new Map(tasks.map((task) => [task.id, parseProjectDependencyIds(task.dependsOn).filter((id) => ids.has(id))]));
  const visiting = new Set();
  const visited = new Set();
  const cyclic = new Set();
  function visit(id, trail) {
    if (visiting.has(id)) {
      const start = trail.indexOf(id);
      for (const item of trail.slice(Math.max(0, start))) cyclic.add(item);
      cyclic.add(id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of edges.get(id) || []) visit(next, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(task.id, []);
  return cyclic;
}

function rateOf(user) {
  return user?.userType === 'freelancer' ? Math.max(0, Number(user.hourlyRate) || 0) : hourRate(user?.salary || 0);
}

function vnd(value, fxRate = 1) {
  return Math.round(Math.max(0, Number(value) || 0) * Math.max(0, Number(fxRate) || 1));
}

function financialSnapshot({ project, timeLogs, usersById, vendorBills, invoices }) {
  const laborAccrued = Math.round(timeLogs.reduce((sum, log) => sum + Math.max(0, Number(log.hours) || 0) * rateOf(usersById[log.userId]), 0));
  const vendorCommitted = Math.round(vendorBills.reduce((sum, bill) => sum + Math.max(0, Number(bill.amount) || 0), 0));
  const vendorPaid = Math.round(vendorBills.filter((bill) => bill.status === 'paid')
    .reduce((sum, bill) => sum + Math.max(0, Number(bill.amount) || 0), 0));
  const eligibleInvoices = invoices.filter((invoice) => !['cancelled', 'void'].includes(String(invoice.status)));
  const invoiced = eligibleInvoices.reduce((sum, invoice) => sum + vnd(docGrand(invoice), invoice.fxRate), 0);
  const collected = eligibleInvoices.reduce((sum, invoice) => sum + vnd(paidOf(invoice), invoice.fxRate), 0);
  const planningCostProxy = laborAccrued + vendorCommitted;
  return Object.freeze({
    revenueTarget: Math.max(0, Number(project.budget) || 0),
    invoiced,
    collected,
    laborAccrued,
    vendorCommitted,
    vendorPaid,
    planningCostProxy,
    planningMarginProxy: Math.max(0, Number(project.budget) || 0) - planningCostProxy,
    cashContributionProxy: collected - laborAccrued - vendorPaid,
    confidence: 'provisional',
    revenueBasis: 'project_budget',
    costBasis: 'declared_timelog_rate_plus_vendor_commitment',
    isAccountingProfit: false,
  });
}

function capacitySnapshot({ projectTasks, companyTasks, queueStates, usersById, loggedByTask }) {
  const memberIds = [...new Set(projectTasks.filter((task) => OPEN.has(String(task.status)) && task.assigneeId).map((task) => task.assigneeId))];
  const queueByOwner = new Map(queueStates.map((queue) => [queue.ownerId, queue]));
  const members = memberIds.map((userId) => {
    const queue = queueByOwner.get(userId) || { wipLimit: 5, version: 0 };
    const globalOpen = companyTasks.filter((task) => task.assigneeId === userId && OPEN.has(String(task.status)));
    const globalWip = globalOpen.filter((task) => WIP.has(String(task.status))).length;
    const projectOpen = projectTasks.filter((task) => task.assigneeId === userId && OPEN.has(String(task.status)));
    const remainingEstimate = projectOpen.reduce((sum, task) => {
      const estimate = Math.max(0, Number(task.estHours) || 0);
      return sum + Math.max(0, estimate - actualHoursOf(task, loggedByTask));
    }, 0);
    const ratio = globalWip / Math.max(1, Number(queue.wipLimit) || 5);
    const band = ratio > 1 ? 'over' : ratio >= 0.8 ? 'near' : 'available';
    const user = usersById[userId] || {};
    return Object.freeze({
      userId,
      name: user.name || 'Chưa rõ nhân sự',
      title: user.title || null,
      projectOpenTasks: projectOpen.length,
      projectRemainingEstimateHours: round(remainingEstimate),
      globalWip,
      wipLimit: Math.max(1, Number(queue.wipLimit) || 5),
      band,
      label: band === 'over' ? 'Vượt WIP' : band === 'near' ? 'Gần giới hạn' : 'Còn khả năng nhận việc',
    });
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return Object.freeze({
    members,
    assignedMembers: members.length,
    constrainedMembers: members.filter((member) => member.band === 'over').length,
    nearLimitMembers: members.filter((member) => member.band === 'near').length,
    unit: 'wip',
    employeeRanking: false,
  });
}

function phaseSnapshots(phases, tasks, loggedByTask, unresolvedByTask) {
  return [...phases].sort((a, b) => Number(a.order) - Number(b.order)).map((phase) => {
    const rows = tasks.filter((task) => task.phaseId === phase.id);
    const progress = progressOf(rows);
    const estimateHours = rows.reduce((sum, task) => sum + Math.max(0, Number(task.estHours) || 0), 0);
    const actualHours = rows.reduce((sum, task) => sum + actualHoursOf(task, loggedByTask), 0);
    const blocked = rows.filter((task) => task.status === 'blocked' || task.blockReason).length;
    const unresolvedDependencies = rows.reduce((sum, task) => sum + (unresolvedByTask.get(task.id)?.length || 0), 0);
    const level = blocked ? 'red' : unresolvedDependencies ? 'amber' : 'green';
    return Object.freeze({
      id: phase.id,
      name: phase.name,
      order: phase.order,
      color: phase.color || null,
      progress,
      estimateHours: round(estimateHours),
      declaredLoggedHours: round(actualHours),
      blocked,
      unresolvedDependencies,
      level,
    });
  });
}

function addSignal(signals, id, level, label, explanation, source) {
  signals.push(Object.freeze({ id, level, label, explanation, source }));
}

export function buildProjectExecutionHealth({
  project,
  tasks = [],
  companyTasks = tasks,
  dependencyTasks = [],
  timeLogs = [],
  usersById = {},
  queueStates = [],
  milestones = [],
  phases = [],
  vendorBills = [],
  invoices = [],
  canSeeMoney = false,
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!project?.id) throw new TypeError('Project execution health requires a project.');
  const projectTasks = tasks.filter((task) => !task.projectId || task.projectId === project.id);
  const projectLogs = timeLogs.filter((log) => !log.projectId || log.projectId === project.id);
  const loggedByTask = new Map();
  for (const log of projectLogs) if (log.taskId) loggedByTask.set(log.taskId, (loggedByTask.get(log.taskId) || 0) + Math.max(0, Number(log.hours) || 0));
  const taskById = new Map([...dependencyTasks, ...projectTasks].map((task) => [task.id, task]));
  const unresolvedByTask = new Map();
  const dependencyRows = [];
  for (const task of projectTasks.filter((item) => OPEN.has(String(item.status)))) {
    const unresolved = parseProjectDependencyIds(task.dependsOn).map((id) => taskById.get(id) || { id, title: 'Task ngoài snapshot', status: 'unknown' })
      .filter((dependency) => !TERMINAL.has(String(dependency.status)));
    unresolvedByTask.set(task.id, unresolved);
    for (const dependency of unresolved) dependencyRows.push(Object.freeze({
      taskId: task.id,
      taskTitle: task.title,
      dependsOnId: dependency.id,
      dependsOnTitle: dependency.title || 'Task chưa rõ',
      dependsOnStatus: dependency.status || 'unknown',
    }));
  }

  const progress = progressOf(projectTasks);
  const schedule = scheduleOf(project, progress, today);
  const openTasks = projectTasks.filter((task) => OPEN.has(String(task.status)));
  const blockedTasks = openTasks.filter((task) => task.status === 'blocked' || task.blockReason);
  const waitingTasks = openTasks.filter((task) => ['waiting', 'review'].includes(String(task.status)));
  const overdueTasks = openTasks.filter((task) => isoDay(task.dueDate) && task.dueDate < today);
  const unassignedTasks = openTasks.filter((task) => !task.assigneeId);
  const cycles = dependencyCycles(projectTasks);
  const overdueMilestones = milestones.filter((milestone) => !milestone.done && isoDay(milestone.date) && milestone.date < today);
  const totalEstimate = projectTasks.reduce((sum, task) => sum + Math.max(0, Number(task.estHours) || 0), 0);
  const openEstimate = openTasks.reduce((sum, task) => sum + Math.max(0, Number(task.estHours) || 0), 0);
  const actualHours = projectTasks.reduce((sum, task) => sum + actualHoursOf(task, loggedByTask), 0);
  const remainingEstimate = openTasks.reduce((sum, task) => sum + Math.max(
    0,
    Math.max(0, Number(task.estHours) || 0) - actualHoursOf(task, loggedByTask),
  ), 0);
  const estimateCoverage = percent(projectTasks.filter((task) => Number(task.estHours) > 0).length, projectTasks.length);
  const classified = projectTasks.filter((task) => task.intelligence?.historical?.workType || task.workType).length;
  const managerValidated = projectTasks.filter((task) => task.intelligence?.estimate?.source === 'manager_validated').length;
  const confidenceBands = { unrated: 0, low: 0, medium: 0 };
  for (const task of projectTasks) {
    const band = task.intelligence?.confidence?.band;
    if (Object.hasOwn(confidenceBands, band)) confidenceBands[band] += 1;
    else confidenceBands.unrated += 1;
  }
  const capacity = capacitySnapshot({ projectTasks, companyTasks, queueStates, usersById, loggedByTask });
  const financial = canSeeMoney ? financialSnapshot({ project, timeLogs: projectLogs, usersById, vendorBills, invoices }) : null;
  const signals = [];

  if (!projectTasks.length && project.status === 'active') addSignal(signals, 'execution_plan_missing', 'attention', 'Chưa có execution plan', 'Dự án đang active nhưng chưa có Task để theo dõi delivery.', 'Task');
  if (schedule.daysRemaining != null && schedule.daysRemaining < 0 && project.status !== 'done') addSignal(signals, 'deadline_overdue', 'critical', 'Đã trễ deadline', `Deadline đã qua ${Math.abs(schedule.daysRemaining)} ngày.`, 'Project.deadline');
  if (blockedTasks.length) addSignal(signals, 'blocked_work', 'critical', `${blockedTasks.length} Task đang blocked`, 'Blocker cần owner hoặc quyết định tiếp theo trước khi delivery tiếp tục.', 'Task.status + blockReason');
  if (overdueMilestones.length) addSignal(signals, 'milestone_overdue', 'critical', `${overdueMilestones.length} milestone trễ`, 'Milestone chưa hoàn tất dù ngày cam kết đã qua.', 'Milestone');
  if (cycles.size) addSignal(signals, 'dependency_cycle', 'critical', 'Dependency có vòng lặp', `${cycles.size} Task nằm trong dependency cycle và không thể tự thông luồng.`, 'Task.dependsOn');
  if (overdueTasks.length) addSignal(signals, 'tasks_overdue', 'attention', `${overdueTasks.length} Task trễ`, 'Task đang mở đã quá due date.', 'Task.dueDate');
  if (dependencyRows.length) addSignal(signals, 'dependencies_unresolved', 'attention', `${dependencyRows.length} dependency chưa xong`, 'Task kế tiếp đang phụ thuộc công việc chưa hoàn tất.', 'Task.dependsOn');
  if (schedule.progressGapPercent != null && schedule.progressGapPercent < -20) addSignal(signals, 'schedule_gap', 'attention', 'Tiến độ thấp hơn nhịp lịch', `Tiến độ thấp hơn nhịp thời gian ${Math.abs(schedule.progressGapPercent)} điểm phần trăm.`, 'Project dates + Task progress');
  if (schedule.daysRemaining != null && schedule.daysRemaining >= 0 && schedule.daysRemaining <= 7 && progress.percent < 80) addSignal(signals, 'deadline_near', 'attention', 'Deadline trong 7 ngày', `Còn ${schedule.daysRemaining} ngày trong khi tiến độ là ${progress.percent}%.`, 'Project.deadline + Task progress');
  if (capacity.constrainedMembers) addSignal(signals, 'capacity_constrained', 'attention', `${capacity.constrainedMembers} nguồn lực vượt WIP`, 'Capacity dùng WIP toàn hệ thống, không phải điểm hiệu suất cá nhân.', 'WorkQueueState + Task');
  if (unassignedTasks.length) addSignal(signals, 'unassigned_work', 'attention', `${unassignedTasks.length} Task chưa có owner`, 'Task không có assignee nên chưa có trách nhiệm delivery rõ ràng.', 'Task.assigneeId');
  if (estimateCoverage != null && estimateCoverage < 75) addSignal(signals, 'estimate_coverage_low', 'attention', 'Thiếu estimate coverage', `Chỉ ${estimateCoverage}% Task có estimate; forecast nguồn lực có confidence thấp.`, 'Task.estHours');
  const burnVsBudget = percent(actualHours, project.budgetHours);
  if (burnVsBudget != null && burnVsBudget > 100) addSignal(signals, 'hours_budget_exceeded', 'critical', 'Vượt ngân sách giờ', `TimeLog tự khai báo đạt ${burnVsBudget}% budget giờ.`, 'TimeLog + Project.budgetHours');
  else if (burnVsBudget != null && burnVsBudget >= 80) addSignal(signals, 'hours_budget_near', 'attention', 'Sắp cạn ngân sách giờ', `TimeLog tự khai báo đạt ${burnVsBudget}% budget giờ.`, 'TimeLog + Project.budgetHours');
  if (financial && financial.planningMarginProxy < 0) addSignal(signals, 'planning_margin_negative', 'critical', 'Planning margin proxy âm', 'Budget dự án thấp hơn labor proxy cộng vendor commitment; đây chưa phải accounting profit.', 'Project budget + declared TimeLog + VendorBill');
  if (!signals.length) addSignal(signals, 'execution_stable', 'info', 'Chưa thấy rủi ro theo rule hiện tại', 'Tiếp tục theo dõi dependency, WIP, deadline và provenance của TimeLog.', 'Project execution snapshot');
  signals.sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level] || a.id.localeCompare(b.id));

  const level = signals.some((signal) => signal.level === 'critical') ? 'red'
    : signals.some((signal) => signal.level === 'attention') ? 'amber' : 'green';
  const confidence = !projectTasks.length ? { band: 'unrated', label: 'Chưa có dữ liệu' }
    : projectTasks.length >= 3 && estimateCoverage >= 75 ? { band: 'medium', label: 'Tham khảo vừa' }
      : { band: 'low', label: 'Tham khảo thấp' };

  return Object.freeze({
    projectId: project.id,
    ruleVersion: PROJECT_EXECUTION_HEALTH_RULE_VERSION,
    health: Object.freeze({
      level,
      label: level === 'red' ? 'Rủi ro' : level === 'amber' ? 'Cần chú ý' : 'Ổn định',
      signals,
      confidence: Object.freeze({ ...confidence, ceiling: 'medium', reason: 'TimeLog hiện vẫn là dữ liệu tự khai báo.' }),
    }),
    progress: Object.freeze(progress),
    schedule: Object.freeze(schedule),
    delivery: Object.freeze({
      open: openTasks.length,
      blocked: blockedTasks.length,
      waiting: waitingTasks.length,
      overdue: overdueTasks.length,
      unassigned: unassignedTasks.length,
      unresolvedDependencies: dependencyRows.length,
      dependencyCycles: cycles.size,
      overdueMilestones: overdueMilestones.length,
    }),
    resource: Object.freeze({
      estimateHours: round(totalEstimate),
      openEstimateHours: round(openEstimate),
      declaredLoggedHours: round(actualHours),
      remainingEstimateHours: round(remainingEstimate),
      burnVsEstimatePercent: percent(actualHours, totalEstimate),
      burnVsBudgetPercent: burnVsBudget,
      estimateCoveragePercent: estimateCoverage,
      classifiedTasks: classified,
      managerValidatedEstimates: managerValidated,
      confidenceBands: Object.freeze(confidenceBands),
      actualSource: 'declared_timelog',
      actualIsObservedTruth: false,
    }),
    capacity,
    blockers: Object.freeze(blockedTasks.map((task) => Object.freeze({
      id: task.id,
      title: task.title,
      status: task.status,
      reason: task.blockReason || task.waitingReason || 'Chưa ghi lý do',
      assigneeId: task.assigneeId || null,
      assigneeName: usersById[task.assigneeId]?.name || 'Chưa có owner',
      dueDate: isoDay(task.dueDate),
    }))),
    dependencies: Object.freeze(dependencyRows),
    phases: Object.freeze(phaseSnapshots(phases, projectTasks, loggedByTask, unresolvedByTask)),
    financial,
    provenance: Object.freeze({
      execution: 'canonical_erp_task',
      capacity: 'canonical_task_wip_and_work_queue_state',
      actual: 'declared_timelog',
      finance: financial ? 'planning_proxy_not_accounting_profit' : 'withheld_by_authorization',
    }),
    policy: Object.freeze({
      advisoryOnly: true,
      employeeRanking: false,
      presenceAsProductivity: false,
      payrollUse: false,
      goldUse: false,
      accountingProfitClaim: false,
    }),
  });
}
