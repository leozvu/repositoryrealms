import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.REALM_V2_PHASE_2_URL || 'http://127.0.0.1:3320').replace(/\/$/, '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error('Phase 2 capture is restricted to localhost.');

const outputDir = path.resolve('qa/realm-v2-phase-2');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const actionChecks = [];
const safetyChecks = [];
const generatedAt = '2026-07-29T15:00:00.000Z';

const task = (id, title, status, dueDate, projectName, assigneeId, workVersion, extra = {}) => ({
  id, title, status, dueDate, projectId: `project-${id}`, assigneeId, priority: status === 'blocked' ? 'high' : 'medium', estHours: 6,
  queuePosition: Number(id.replace(/\D/g, '')) || 0, workVersion, escalationLevel: extra.escalationLevel || 0,
  blockReason: extra.blockReason || null, waitingReason: extra.waitingReason || null, updatedAt: generatedAt,
  project: { id: `project-${id}`, name: projectName, status: 'active' }, note: 'Canonical-shaped browser fixture for Phase 2 visual QA.',
});

const memberA = { id: 'member-1', name: 'Mai Anh', title: 'Project Manager', teamId: 'team-1', realmProfile: { realmClass: 'Strategist', color: '#4fa47a' } };
const memberB = { id: 'member-2', name: 'Minh Quân', title: 'Account Lead', teamId: 'team-1', realmProfile: { realmClass: 'Envoy', color: '#6398c8' } };
const teamWork = {
  source: 'erp-task', generatedAt, scope: 'company',
  metrics: { people: 2, open: 6, wip: 2, blocked: 1, overdue: 1, overCapacity: 0, unassigned: 1 },
  policy: { employeeRanking: false, presenceAsProductivity: false, capacityUnit: 'wip' },
  members: [
    { member: memberA, queue: { version: 4, wipLimit: 4 }, capacity: { key: 'available', label: 'Còn khả năng nhận việc', ratio: .5 }, metrics: { open: 3, wip: 1, blocked: 1, waiting: 0, overdue: 0, estimatedOpenHours: 18 }, tasks: [
      task('task-1', 'Rà soát brief chiến dịch mùa thu', 'todo', '2026-08-02', 'Chiến dịch mùa thu', memberA.id, 2),
      task('task-2', 'Hoàn thiện dashboard vận hành', 'in_progress', '2026-07-31', 'Nâng cấp vận hành', memberA.id, 3),
      task('task-3', 'Xác nhận quyền truy cập kho dữ liệu', 'blocked', '2026-08-01', 'Nâng cấp vận hành', memberA.id, 5, { blockReason: 'Chờ quyền truy cập từ IT.' }),
    ] },
    { member: memberB, queue: { version: 2, wipLimit: 5 }, capacity: { key: 'available', label: 'Còn khả năng nhận việc', ratio: .2 }, metrics: { open: 2, wip: 1, blocked: 0, waiting: 1, overdue: 1, estimatedOpenHours: 12 }, tasks: [
      task('task-4', 'Chuẩn bị nội dung họp khách hàng', 'review', '2026-08-03', 'Retainer quý III', memberB.id, 4, { waitingReason: 'client_review' }),
      task('task-5', 'Chốt biên bản đối soát tháng', 'in_progress', '2026-07-28', 'Vận hành nội bộ', memberB.id, 6),
    ] },
  ],
  unassigned: [task('task-6', 'Phân loại yêu cầu tích hợp mới', 'todo', '2026-08-05', 'Vận hành nội bộ', null, 1)],
};

const approvals = {
  pendingCount: 2,
  mine: [],
  toApprove: [
    { id: 'approval-1', type: 'expense', title: 'Duyệt ngân sách sản xuất', amount: 25000000, requesterName: 'Nguyễn Minh An', createdAt: generatedAt, status: 'pending', steps: JSON.stringify([{ role: 'ACCOUNTANT', label: 'Kế toán', status: 'pending' }, { role: 'DIRECTOR', label: 'Giám đốc', status: 'waiting' }]) },
    { id: 'approval-2', type: 'task_handoff', title: 'Bàn giao chiến dịch mùa thu', amount: 0, requesterName: 'Quang Vũ', createdAt: generatedAt, status: 'pending', steps: JSON.stringify([{ role: 'PM', label: 'Project Manager', status: 'pending' }]) },
  ],
};

const notifications = { unread: 1, rows: [{ id: 'notification-1', title: 'Khách hàng đã phản hồi tài liệu', route: '/messages?focus=notification-1', createdAt: generatedAt, readAt: null }] };

try {
  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 1000 },
    { name: 'laptop-1024', width: 1024, height: 900 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'phone-390', width: 390, height: 844 },
    { name: 'phone-375', width: 375, height: 812 },
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const actionRequests = [];
    await page.route('**/api/execution/team-work', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teamWork) }));
    await page.route('**/api/approvals', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(approvals) }));
    await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notifications) }));
    await page.route('**/api/collaboration/contact', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ incoming: [], outgoing: [] }) }));
    await page.route('**/api/collaboration/presence', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
    await page.route('**/api/realm-demo/pilot', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { allowed: true, preference: 'realm' } }) }));
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'phase-2-qa', name: 'Realm Operations QA', email: 'qa@example.invalid', roles: ['PM'] }, expires: '2099-01-01T00:00:00.000Z' }) }));
    await page.route('**/api/execution/actions', async (route) => {
      actionRequests.push({ body: route.request().postDataJSON(), idempotencyKey: route.request().headers()['idempotency-key'] || '' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'erp-task', repository: { name: 'RepositoryRealms', receiptId: 'rr-phase-2-qa-receipt', invariants: { authorization: 'enforced', businessRules: 'enforced', receipt: 'verified', audit: 'atomic' } } }) });
    });
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); });
    page.on('response', (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url().replace(baseUrl, '') }); });

    for (const slug of ['work-management', 'action-center']) {
      const response = await page.goto(`${baseUrl}/realm-v2/phase-2-qa?screen=${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByRole('heading', { name: slug === 'work-management' ? 'Luồng công việc của Guild' : 'Ngoại lệ và quyết định' }).waitFor({ state: 'visible', timeout: 15_000 });
      await page.screenshot({ path: path.join(outputDir, `${slug}-${viewport.name}.png`), fullPage: true });
      const mobileNavItems = await page.locator('nav[aria-label="Điều hướng chính trên di động"] a').count();
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      results.push({
        slug, viewport: viewport.name, status: response?.status() || null, finalPath: new URL(page.url()).pathname,
        heading: await page.locator('main h1').textContent().catch(() => null), mobileNavItems, horizontalOverflowPx: overflow,
        consoleErrors: [...consoleErrors], failedResponses: [...failedResponses],
      });

      if (viewport.name === 'desktop-1440' && slug === 'work-management') {
        await page.locator('[data-task-id="task-1"]').getByRole('button', { name: /Xem và điều phối/ }).click();
        await page.getByLabel('Lý do can thiệp').fill('Chờ dữ liệu đầu vào đã được xác nhận trong ERP.');
        await page.getByRole('button', { name: 'Báo blocker' }).click();
        await page.getByText('rr-phase-2-qa-receipt').waitFor({ state: 'visible' });
        const request = actionRequests[0];
        actionChecks.push({
          action: request?.body?.action || null, entityId: request?.body?.entityId || null,
          expectedVersion: request?.body?.expectedVersion || null, reasonCode: request?.body?.reasonCode || null,
          reasonPresent: Boolean(request?.body?.reason), idempotencyKeyPresent: Boolean(request?.idempotencyKey),
        });
      }
      if (viewport.name === 'desktop-1440' && slug === 'action-center') {
        safetyChecks.push({
          approvalDeepLinkPresent: await page.getByRole('link', { name: 'Mở phê duyệt ERP' }).count() === 1,
          directApproveButtonCount: await page.getByRole('button', { name: /^Duyệt$/ }).count(),
          failClosedCopyPresent: await page.getByText(/`approval\.decide` chưa nằm trong allowlist/).count() === 1,
        });
      }
      consoleErrors.length = 0;
      failedResponses.length = 0;
    }
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, 'capture-results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, actionChecks, safetyChecks }, null, 2)}\n`);
const failures = results.filter((result) => result.status !== 200 || result.finalPath !== '/realm-v2/phase-2-qa' || result.horizontalOverflowPx > 0 || result.mobileNavItems !== 5 || result.consoleErrors.length || result.failedResponses.length);
const actionFailure = actionChecks.length !== 1 || actionChecks[0].action !== 'task.block' || actionChecks[0].entityId !== 'task-1' || actionChecks[0].expectedVersion !== 2 || actionChecks[0].reasonCode !== 'dependency' || !actionChecks[0].reasonPresent || !actionChecks[0].idempotencyKeyPresent;
const safetyFailure = safetyChecks.length !== 1 || !safetyChecks[0].approvalDeepLinkPresent || safetyChecks[0].directApproveButtonCount !== 0 || !safetyChecks[0].failClosedCopyPresent;
if (failures.length || actionFailure || safetyFailure) {
  console.error(JSON.stringify({ failures, actionChecks, safetyChecks }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Phase 2 browser capture passed: ${results.length}/${results.length} views.`);
}
