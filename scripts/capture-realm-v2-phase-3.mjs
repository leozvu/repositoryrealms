import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.REALM_V2_PHASE_3_URL || 'http://127.0.0.1:3330').replace(/\/$/, '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error('Phase 3 capture is restricted to localhost.');

const outputDir = path.resolve('qa/realm-v2-phase-3');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const commandChecks = [];
const safetyChecks = [];
const generatedAt = '2026-07-29T15:00:00.000Z';

const registry = {
  entities: [
    { id: 'egoric-agency', displayName: 'Egoric Agency', enabled: true },
    { id: 'aim-agency', displayName: 'AIM Agency', enabled: true },
    { id: 'vnecom-llc', displayName: 'VNECOM LLC', enabled: true },
    { id: 'egolive', displayName: 'Egolive', enabled: true },
  ],
};

const delivery = (id, action, status, entity, receipt = null) => ({
  id, targetEntityId: entity.id, targetDisplayName: entity.displayName, action,
  scope: action === 'task.create' ? 'command.task.create' : 'command.status.request',
  correlationId: `phase-3:${id}`, status, attemptCount: 1, receipt,
  lastErrorCode: null, createdAt: generatedAt, updatedAt: generatedAt,
});

const deliveries = [
  delivery('delivery-1', 'task.create', 'delivered', registry.entities[0], { id: 'RR-CMD-001', resource: 'tasks', recordId: 'task-100', committedAt: generatedAt, href: '/tasks?focus=task-100' }),
  delivery('delivery-2', 'status.request', 'pending_confirmation', registry.entities[2]),
];

const approval = (id, title, status, requesterName, amount, steps, extra = {}) => ({
  id, type: extra.type || 'expense', title, status, requesterName, requesterId: extra.requesterId || `requester-${id}`,
  amount, steps: JSON.stringify(steps), createdAt: generatedAt, decidedAt: status === 'pending' ? null : generatedAt,
});

const approvals = {
  pendingCount: 3,
  toApprove: [
    approval('approval-1', 'Duyệt ngân sách sản xuất quý III', 'pending', 'Nguyễn Minh An', 25000000, [
      { role: 'ACCOUNTANT', label: 'Kế toán', status: 'approved', byName: 'Lan Phạm' },
      { role: 'DIRECTOR', label: 'Giám đốc', status: 'pending' },
    ]),
    approval('approval-2', 'Bàn giao chiến dịch mùa thu', 'pending', 'Quang Vũ', 0, [{ role: 'PM', label: 'Project Manager', status: 'pending' }], { type: 'task_handoff' }),
    approval('approval-3', 'Mở rộng Realm cho cohort mới', 'pending', 'Mai Anh', 0, [
      { role: 'DIRECTOR', label: 'Director maker', status: 'approved', byName: 'Mai Anh' },
      { role: 'DIRECTOR', label: 'Director checker', status: 'pending' },
    ], { type: 'realm_launch' }),
  ],
  mine: [
    approval('approval-mine-1', 'Duyệt kế hoạch tuyển dụng', 'pending', 'Vũ Lương Sơn', 0, [{ role: 'HR', label: 'HR', status: 'pending' }], { requesterId: 'phase-3-director' }),
    approval('approval-mine-2', 'Ngân sách hạ tầng tháng 8', 'approved', 'Vũ Lương Sơn', 12000000, [{ role: 'ACCOUNTANT', label: 'Kế toán', status: 'approved', byName: 'Lan Phạm' }], { requesterId: 'phase-3-director' }),
    approval('approval-mine-3', 'Đề xuất nhà cung cấp mới', 'rejected', 'Vũ Lương Sơn', 5000000, [{ role: 'DIRECTOR', label: 'Giám đốc', status: 'rejected', byName: 'Phạm Minh Quân' }], { requesterId: 'phase-3-director' }),
  ],
};

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
    const commandRequests = [];
    await page.route('**/api/ceo/v1/registry', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(registry) }));
    await page.route('**/api/ceo/v1/identity/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: true, stepUp: true, subject: 'ceo:phase-3-director' }) }));
    await page.route('**/api/ceo/v1/command-gateway**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith('/reconcile')) {
        const reconciled = { ...deliveries[1], status: 'delivered', receipt: { id: 'RR-CMD-RECONCILED', resource: 'tasks', recordId: 'task-status-1', committedAt: generatedAt, href: '/tasks?focus=task-status-1' } };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ delivery: reconciled }) });
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        commandRequests.push(body);
        const confirmed = {
          id: 'delivery-phase-3-new', targetEntityId: body.targetEntityId, targetDisplayName: 'Egoric Agency',
          action: body.action, scope: 'command.task.create', correlationId: body.correlationId,
          status: 'delivered', attemptCount: 1, createdAt: generatedAt, updatedAt: generatedAt,
          receipt: { id: 'RR-PHASE3-001', resource: 'tasks', recordId: 'task-phase-3', committedAt: generatedAt, href: '/tasks?focus=task-phase-3' },
        };
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ replayed: false, delivery: confirmed }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 1, deliveries }) });
    });
    await page.route('**/api/approvals', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(approvals) }));
    await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unread: 0, rows: [] }) }));
    await page.route('**/api/collaboration/contact', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ incoming: [], outgoing: [] }) }));
    await page.route('**/api/collaboration/presence', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
    await page.route('**/api/realm-demo/pilot', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { allowed: true, preference: 'realm' } }) }));
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'phase-3-director', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', roles: ['DIRECTOR'] }, expires: '2099-01-01T00:00:00.000Z' }) }));
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); });
    page.on('response', (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url().replace(baseUrl, '') }); });

    for (const slug of ['command-center', 'approvals']) {
      const response = await page.goto(`${baseUrl}/realm-v2/phase-3-qa?screen=${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 15_000 });
      if (slug === 'command-center') {
        await page.getByLabel('Công ty đích').selectOption('egoric-agency');
        await page.getByLabel('Ý định cần thực hiện').fill('Hoàn thiện báo cáo chiến dịch mùa thu trước thứ Sáu.\nĐính kèm bối cảnh vận hành và người phụ trách trong entity đích.');
        await page.getByRole('button', { name: 'Cấu trúc proposal' }).click();
        await page.getByText('task.create', { exact: true }).waitFor({ state: 'visible' });
      } else {
        await page.getByRole('heading', { name: 'Approval review workspace' }).waitFor({ state: 'visible' });
      }
      await page.screenshot({ path: path.join(outputDir, `${slug}-${viewport.name}.png`), fullPage: true });
      const mobileNavItems = await page.locator('nav[aria-label="Điều hướng chính trên di động"] a').count();
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      results.push({
        slug, viewport: viewport.name, status: response?.status() || null, finalPath: new URL(page.url()).pathname,
        heading: await page.locator('main h1').textContent().catch(() => null), mobileNavItems, horizontalOverflowPx: overflow,
        consoleErrors: [...consoleErrors], failedResponses: [...failedResponses],
      });

      if (viewport.name === 'desktop-1440' && slug === 'command-center') {
        await page.getByLabel(/Tôi đã kiểm tra đúng entity/).check();
        await page.getByRole('button', { name: 'Submit proposal' }).click();
        await page.getByText('RR-PHASE3-001').first().waitFor({ state: 'visible', timeout: 15_000 });
        const request = commandRequests[0];
        commandChecks.push({
          targetEntityId: request?.targetEntityId || null, action: request?.action || null,
          title: request?.payload?.title || null, notePresent: Boolean(request?.payload?.note),
          idempotencyKeyPresent: /^realm-v2-command:/.test(request?.idempotencyKey || ''),
          correlationIdPresent: /^realm-v2-correlation:/.test(request?.correlationId || ''),
          receiptVisible: await page.getByText('RR-PHASE3-001').count() >= 1,
        });
      }
      if (viewport.name === 'desktop-1440' && slug === 'approvals') {
        safetyChecks.push({
          erpDecisionDeepLinkPresent: await page.getByRole('link', { name: 'Mở quyết định trong ERP' }).count() === 1,
          directApproveButtonCount: await page.getByRole('button', { name: /^Duyệt$/ }).count(),
          directRejectButtonCount: await page.getByRole('button', { name: /^Từ chối$/ }).count(),
          failClosedCopyPresent: await page.getByText(/`approval\.decide` chưa có contract chung/).count() === 1,
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

await fs.writeFile(path.join(outputDir, 'capture-results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, commandChecks, safetyChecks }, null, 2)}\n`);
const failures = results.filter((result) => result.status !== 200 || result.finalPath !== '/realm-v2/phase-3-qa' || result.horizontalOverflowPx > 0 || result.mobileNavItems !== 5 || result.consoleErrors.length || result.failedResponses.length);
const commandFailure = commandChecks.length !== 1 || commandChecks[0].targetEntityId !== 'egoric-agency' || commandChecks[0].action !== 'task.create' || !commandChecks[0].title.startsWith('Hoàn thiện báo cáo') || !commandChecks[0].notePresent || !commandChecks[0].idempotencyKeyPresent || !commandChecks[0].correlationIdPresent || !commandChecks[0].receiptVisible;
const safetyFailure = safetyChecks.length !== 1 || !safetyChecks[0].erpDecisionDeepLinkPresent || safetyChecks[0].directApproveButtonCount !== 0 || safetyChecks[0].directRejectButtonCount !== 0 || !safetyChecks[0].failClosedCopyPresent;
if (failures.length || commandFailure || safetyFailure) {
  console.error(JSON.stringify({ failures, commandChecks, safetyChecks }, null, 2));
  process.exitCode = 1;
} else console.log(`Phase 3 browser capture passed: ${results.length}/${results.length} views.`);
