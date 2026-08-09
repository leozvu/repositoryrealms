import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.REALM_V2_PHASE_1_URL || 'http://127.0.0.1:3310').replace(/\/$/, '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error('Phase 1 capture is restricted to localhost.');

const outputDir = path.resolve('qa/realm-v2-phase-1');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const actionChecks = [];
const generatedAt = '2026-07-29T14:00:00.000Z';
const task = (id, title, status, queuePosition, dueDate, projectName) => ({
  id, title, status, queuePosition, dueDate, priority: status === 'blocked' ? 'high' : 'medium', estHours: 6,
  project: { id: `project-${id}`, name: projectName }, note: 'Dữ liệu mô phỏng chỉ tồn tại trong browser harness Phase 1.',
});
const myWork = {
  source: 'erp-task', generatedAt,
  queue: { ownerId: 'phase-1-qa', version: 4, wipLimit: 5 },
  metrics: { open: 5, doing: 1, waiting: 1, blocked: 1, overdue: 1 },
  queues: {
    inbox: [task('task-1', 'Rà soát brief chiến dịch mùa thu', 'todo', 0, '2026-08-02', 'Chiến dịch mùa thu')],
    planned: [task('task-2', 'Chuẩn bị nội dung họp khách hàng', 'todo', 1, '2026-07-30', 'Retainer quý III')],
    doing: [task('task-3', 'Hoàn thiện dashboard hiệu quả', 'in_progress', 2, '2026-07-31', 'Nâng cấp vận hành')],
    waiting: [task('task-4', 'Chờ duyệt ngân sách sản xuất', 'waiting', 3, '2026-08-01', 'Video thương hiệu')],
    blocked: [task('task-5', 'Xác nhận quyền truy cập kho dữ liệu', 'blocked', 4, '2026-07-28', 'Nâng cấp vận hành')],
    completed: [task('task-6', 'Chốt biên bản họp tuần', 'done', 0, '2026-07-27', 'Vận hành nội bộ')],
  },
};
const approvals = { pendingCount: 1, mine: [], toApprove: [{ id: 'approval-1', title: 'Duyệt ngân sách sản xuất', requesterName: 'Nguyễn Minh An', createdAt: generatedAt }] };
const notifications = { unread: 1, rows: [{ id: 'notification-1', title: 'Task ERP vừa được cập nhật', route: '/tasks?focus=task-3', createdAt: generatedAt, readAt: null }] };

try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const actionRequests = [];
    await page.route('**/api/execution/my-work', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(myWork) }));
    await page.route('**/api/approvals', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(approvals) }));
    await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notifications) }));
    await page.route('**/api/collaboration/contact', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ incoming: [], outgoing: [] }) }));
    await page.route('**/api/collaboration/presence', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
    await page.route('**/api/realm-demo/pilot', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { allowed: true, preference: 'realm' } }) }));
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'phase-1-qa', name: 'Realm QA', email: 'qa@example.invalid', roles: ['STAFF'] }, expires: '2099-01-01T00:00:00.000Z' }) }));
    await page.route('**/api/execution/actions', async (route) => {
      actionRequests.push({ body: route.request().postDataJSON(), idempotencyKey: route.request().headers()['idempotency-key'] || '' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'erp-task', action: { receiptId: 'phase-1-qa-receipt' } }) });
    });
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); });
    page.on('response', (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url().replace(baseUrl, '') }); });
    for (const slug of ['home', 'my-work']) {
      const response = await page.goto(`${baseUrl}/realm-v2/phase-1-qa?screen=${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 15_000 });
      await page.getByRole('heading', { name: slug === 'home' ? 'Bước tiếp theo' : 'Hàng đợi của bạn' }).waitFor({ state: 'visible', timeout: 15_000 });
      await page.screenshot({ path: path.join(outputDir, `${slug}-${viewport.name}.png`), fullPage: true });
      const mobileNavItems = await page.locator('nav[aria-label="Điều hướng chính trên di động"] a').count();
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      results.push({
        slug,
        viewport: viewport.name,
        status: response?.status() || null,
        finalPath: new URL(page.url()).pathname,
        heading: await page.locator('main h1').textContent().catch(() => null),
        mobileNavItems,
        horizontalOverflowPx: overflow,
        consoleErrors: [...consoleErrors],
        failedResponses: [...failedResponses],
      });
      if (viewport.name === 'desktop' && slug === 'my-work') {
        const startButton = page.locator('[data-task-id="task-1"] button');
        const count = await startButton.count();
        if (count !== 1) throw new Error(`Expected one canonical start action, found ${count}.`);
        await startButton.click();
        await page.waitForFunction(() => document.querySelector('[data-task-id="task-1"]') !== null);
        const request = actionRequests[0];
        actionChecks.push({
          action: request?.body?.action || null,
          entityId: request?.body?.entityId || null,
          expectedState: request?.body?.expectedState || null,
          nextState: request?.body?.nextState || null,
          idempotencyKeyPresent: Boolean(request?.idempotencyKey),
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

await fs.writeFile(path.join(outputDir, 'capture-results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, actionChecks }, null, 2)}\n`);
const failures = results.filter((result) => result.status !== 200 || result.finalPath !== '/realm-v2/phase-1-qa' || result.horizontalOverflowPx > 0 || result.mobileNavItems !== 5);
const actionFailure = actionChecks.length !== 1 || actionChecks[0].action !== 'task.transition' || actionChecks[0].entityId !== 'task-1' || actionChecks[0].expectedState !== 'todo' || actionChecks[0].nextState !== 'in_progress' || !actionChecks[0].idempotencyKeyPresent;
if (failures.length || actionFailure) {
  console.error(JSON.stringify({ failures, actionChecks }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Phase 1 browser capture passed: ${results.length}/${results.length} views.`);
}
