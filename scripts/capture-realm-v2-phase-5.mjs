import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.REALM_V2_PHASE_5_URL || 'http://127.0.0.1:3332').replace(/\/$/, '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error('Phase 5 capture is restricted to localhost.');

const outputDir = path.resolve('qa/realm-v2-phase-5');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const generatedAt = '2026-07-30T15:00:00.000Z';
const results = [];
const mutationRequests = [];

const projects = [
  { id: 'project-blue-dragon', name: 'Chiến dịch Rồng Xanh', clientId: 'client-north', service: 'Brand Campaign', status: 'active', startDate: '2026-07-01', deadline: '2026-08-12', budgetHours: 180, progress: 64 },
  { id: 'project-north-fair', name: 'Hội chợ phương Bắc', clientId: 'client-north', service: 'CRM / Sales', status: 'active', startDate: '2026-07-15', deadline: '2026-08-28', budgetHours: 120, progress: 38 },
  { id: 'project-alchemist', name: 'Landing Page Nhà Giả Kim', clientId: 'client-alchemist', service: 'Web Product', status: 'planning', startDate: '2026-07-29', deadline: '2026-09-05', budgetHours: 80, progress: 12 },
];

const stats = {
  'project-blue-dragon': { health: 'amber', progress: 64, blockedTasks: 2, dependencyBlocked: 1, constrainedMembers: 1 },
  'project-north-fair': { health: 'green', progress: 38, blockedTasks: 0, dependencyBlocked: 0, constrainedMembers: 0 },
  'project-alchemist': { health: 'green', progress: 12, blockedTasks: 0, dependencyBlocked: 0, constrainedMembers: 0 },
};

function executionHealth(project) {
  const blue = project.id === 'project-blue-dragon';
  return {
    source: 'canonical-erp-project', generatedAt, canSeeMoney: true,
    project: { id: project.id, name: project.name, clientId: project.clientId, clientName: project.id === 'project-alchemist' ? 'The Alchemist' : 'Northern Guild', service: project.service, status: project.status, startDate: project.startDate, deadline: project.deadline, budgetHours: project.budgetHours },
    executionHealth: {
      projectId: project.id, ruleVersion: 'project-execution-health-v1',
      health: { level: blue ? 'amber' : 'green', label: blue ? 'Cần chú ý' : 'Ổn định', signals: blue ? [
        { id: 'deadline_gap', level: 'attention', label: 'Tiến độ thấp hơn kỳ vọng', explanation: 'Project đang thấp hơn đường tiến độ kế hoạch 11%.', source: 'Project.deadline + weighted Task progress' },
        { id: 'blocked_work', level: 'critical', label: 'Có Task bị chặn', explanation: 'Hai Task đang có blockReason cần xử lý.', source: 'Task.blockReason' },
      ] : [], confidence: { band: 'medium', label: 'Độ tin cậy trung bình', ceiling: 'medium', reason: 'TimeLog là dữ liệu tự khai báo.' } },
      progress: { percent: blue ? 64 : project.progress, completed: blue ? 7 : 3, total: blue ? 12 : 8, basis: 'task_estimate' },
      schedule: { deadline: project.deadline, daysRemaining: blue ? 13 : 29, expectedPercent: blue ? 75 : 32, progressGapPercent: blue ? -11 : 6 },
      delivery: { open: blue ? 5 : 5, blocked: blue ? 2 : 0, waiting: 1, overdue: blue ? 1 : 0, unassigned: 1, unresolvedDependencies: blue ? 1 : 0, dependencyCycles: 0, overdueMilestones: 0 },
      resource: { estimateHours: blue ? 156 : 88, openEstimateHours: blue ? 62 : 54, declaredLoggedHours: blue ? 104.5 : 31, remainingEstimateHours: blue ? 51.5 : 57, burnVsEstimatePercent: blue ? 67 : 35, burnVsBudgetPercent: blue ? 58 : 26, estimateCoveragePercent: blue ? 92 : 75, managerValidatedEstimates: blue ? 8 : 5, classifiedTasks: blue ? 10 : 6, actualSource: 'declared_timelog', actualIsObservedTruth: false },
      capacity: { assignedMembers: 3, constrainedMembers: blue ? 1 : 0, nearLimitMembers: 1, employeeRanking: false, members: [
        { userId: 'user-mai', name: 'Mai Anh', title: 'Client Lead', projectOpenTasks: 2, projectRemainingEstimateHours: 22, globalWip: 4, wipLimit: 5, band: 'near', label: 'Gần giới hạn' },
        { userId: 'user-minh', name: 'Minh Quân', title: 'Quest Master', projectOpenTasks: 2, projectRemainingEstimateHours: 20, globalWip: blue ? 6 : 3, wipLimit: 5, band: blue ? 'over' : 'available', label: blue ? 'Vượt WIP' : 'Có khả năng nhận việc' },
        { userId: 'user-quang', name: 'Quang Vũ', title: 'Operations', projectOpenTasks: 1, projectRemainingEstimateHours: 9.5, globalWip: 2, wipLimit: 5, band: 'available', label: 'Có khả năng nhận việc' },
      ] },
      blockers: blue ? [
        { id: 'task-lock-campaign', title: 'Khóa sổ chiến dịch Rồng Xanh', status: 'blocked', reason: 'Chờ khách hàng xác nhận phạm vi cuối.', assigneeId: 'user-mai', assigneeName: 'Mai Anh', dueDate: '2026-08-02' },
        { id: 'task-media', title: 'Bàn giao media plan', status: 'blocked', reason: 'Thiếu phê duyệt ngân sách kênh.', assigneeId: 'user-minh', assigneeName: 'Minh Quân', dueDate: '2026-08-04' },
      ] : [],
      dependencies: blue ? [{ taskId: 'task-media', taskTitle: 'Bàn giao media plan', dependsOnId: 'task-budget', dependsOnTitle: 'Duyệt ngân sách kênh', dependsOnStatus: 'review' }] : [],
      phases: [
        { id: `${project.id}-discovery`, name: 'Discovery', order: 0, color: '#4fa47a', progress: 100, estimateHours: 28, declaredLoggedHours: 27, blocked: 0, unresolvedDependencies: 0, level: 'green' },
        { id: `${project.id}-delivery`, name: 'Delivery', order: 1, color: '#6398c8', progress: blue ? 58 : 31, estimateHours: 92, declaredLoggedHours: blue ? 65 : 21, blocked: blue ? 2 : 0, unresolvedDependencies: blue ? 1 : 0, level: blue ? 'amber' : 'green' },
        { id: `${project.id}-close`, name: 'Close-out', order: 2, color: '#c8a96b', progress: 10, estimateHours: 36, declaredLoggedHours: 2.5, blocked: 0, unresolvedDependencies: 0, level: 'green' },
      ],
      financial: { revenueTarget: 420000000, invoiced: 210000000, collected: 150000000, laborAccrued: 82000000, vendorCommitted: 76000000, vendorPaid: 43000000, planningCostProxy: 158000000, planningMarginProxy: 262000000, cashContributionProxy: 25000000, confidence: 'provisional', revenueBasis: 'project_budget', costBasis: 'declared_timelog_rate_plus_vendor_commitment', isAccountingProfit: false },
      policy: { advisoryOnly: true, employeeRanking: false, presenceAsProductivity: false, payrollUse: false, goldUse: false, accountingProfitClaim: false },
    },
    limits: { taskSnapshot: 2000, timeLogSnapshot: 10000, taskSnapshotTruncated: false, timeLogSnapshotTruncated: false },
  };
}

const auditRows = [
  { id: 'audit-1', at: '2026-07-30T14:56:00.000Z', userName: 'Mai Anh', action: 'update', entity: 'tasks', refId: 'task-lock-campaign', detail: 'Khóa sổ chiến dịch Rồng Xanh' },
  { id: 'audit-2', at: '2026-07-30T14:42:00.000Z', userName: 'Vũ Lương Sơn', action: 'approve', entity: 'approvalrequests', refId: 'approval-budget-1', detail: 'Ngân sách media quý III' },
  { id: 'audit-3', at: '2026-07-30T14:30:00.000Z', userName: 'ERP Import', action: 'import', entity: 'clients', refId: 'client-north', detail: 'Northern Guild' },
  { id: 'audit-4', at: '2026-07-30T13:52:00.000Z', userName: 'Minh Quân', action: 'create', entity: 'timelogs', refId: 'timelog-88', detail: 'Bàn giao media plan · 2.5h' },
  { id: 'audit-5', at: '2026-07-30T12:20:00.000Z', userName: 'Mai Anh', action: 'update', entity: 'projects', refId: 'project-blue-dragon', detail: 'Chiến dịch Rồng Xanh' },
];

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 1000 },
  { name: 'laptop-1024', width: 1024, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-375', width: 375, height: 812 },
];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); });
    page.on('response', (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url().replace(baseUrl, '') }); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && (/^\/api\/(?:data\/projects|projects(?:\/|$)|audit$)/).test(url.pathname)) mutationRequests.push({ method: request.method(), path: url.pathname });
    });

    await page.route('**/api/data/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projects) }));
    await page.route('**/api/projects/stats', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ canSeeMoney: true, stats }) }));
    await page.route('**/api/projects/*/execution-health', (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-2);
      const project = projects.find((item) => item.id === id) || projects[0];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(executionHealth(project)) });
    });
    await page.route('**/api/audit', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(auditRows) }));
    await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], unread: 0 }) }));
    await page.route('**/api/collaboration/presence', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? { generatedAt, ttlMs: 70000, people: [], onlineUsers: 0 } : { ok: true, sessionId: 'collab_phase_5_qa' }) }));
    await page.route('**/api/collaboration/contact', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generatedAt, incoming: [], outgoing: [] }) }));
    await page.route('**/api/realm-demo/pilot', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { allowed: true, preference: 'realm' } }) }));
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'phase-5-user', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', roles: ['DIRECTOR'] }, expires: '2099-01-01T00:00:00.000Z' }) }));

    for (const slug of ['projects', 'chronicle']) {
      const response = await page.goto(`${baseUrl}/realm-v2/phase-5-qa?screen=${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 15_000 });
      if (slug === 'projects') await page.getByRole('heading', { name: 'Chiến dịch Rồng Xanh', exact: true }).waitFor({ state: 'visible' });
      else await page.getByText('Record canonical · read-only', { exact: true }).waitFor({ state: 'visible' });
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
      await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => { node.style.display = 'none'; }));
      await page.screenshot({ path: path.join(outputDir, `${slug}-${viewport.name}.png`), fullPage: true });
      const mobileNavItems = await page.locator('nav[aria-label="Điều hướng chính trên di động"] a').count();
      const horizontalOverflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      results.push({ slug, viewport: viewport.name, status: response?.status() || null, finalPath: new URL(page.url()).pathname, heading: await page.locator('main h1').textContent(), mobileNavItems, horizontalOverflowPx, consoleErrors: [...consoleErrors], failedResponses: [...failedResponses] });
      consoleErrors.length = 0;
      failedResponses.length = 0;
    }
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, 'capture-results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, mutationRequests }, null, 2)}\n`);
const failures = results.filter((result) => result.status !== 200 || result.finalPath !== '/realm-v2/phase-5-qa' || result.horizontalOverflowPx > 0 || result.mobileNavItems !== 5 || result.consoleErrors.length || result.failedResponses.length);
if (failures.length || mutationRequests.length) {
  console.error(JSON.stringify({ failures, mutationRequests }, null, 2));
  process.exitCode = 1;
} else console.log(`Phase 5 browser capture passed: ${results.length}/${results.length} views; 0 canonical mutations.`);
