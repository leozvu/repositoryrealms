import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.REALM_V2_PHASE_8_URL || 'http://127.0.0.1:3334').replace(/\/$/, '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error('Phase 8 capture is restricted to localhost.');
const outputDir = path.resolve('qa/realm-v2-phase-8');
await fs.mkdir(outputDir, { recursive: true });
const generatedAt = '2026-08-01T15:00:00.000Z';
const browser = await chromium.launch({ headless: true });
const results = [];
const businessMutationRequests = [];

const project = { id: 'project-green-dragon', name: 'Chiến dịch Rồng Xanh', status: 'active', progress: 68, href: '/projects/project-green-dragon' };
const task = (id, title, dueDate) => ({ id, title, status: 'in_progress', priority: 'high', dueDate, project, href: `/tasks?focus=${id}&from=realm` });
const profile = {
  source: 'erp', generatedAt,
  identity: { id: 'phase-8-user', preferredName: 'Vũ Lương Sơn', title: 'Giám đốc điều hành', company: 'Egoric Agency' },
  profile: { currentWork: task('task-1', 'Khóa sổ chiến dịch Rồng Xanh', '2026-08-03'), nextWork: task('task-2', 'Chuẩn hóa CEO operating brief', '2026-08-06'), openWorkCount: 4, activeProjects: [project] },
  recognition: { summary: { balance: 28 } },
};
const notifications = { unread: 3, rows: [
  { id: 'n-approval', text: 'Yêu cầu duyệt ngân sách chiến dịch', route: '/approvals', kind: 'approval', kindLabel: 'Royal Decree', icon: 'shield', readAt: null, createdAt: '2026-08-01T14:40:00.000Z' },
  { id: 'n-message', text: 'Minh Quân đã nhắc bạn trong hội thoại dự án', route: '/messages', kind: 'message', kindLabel: 'Lantern Mail', icon: 'mail', readAt: null, createdAt: '2026-08-01T14:20:00.000Z' },
  { id: 'n-task', text: 'Task Khóa sổ chiến dịch đã chuyển sang review', route: '/tasks?focus=task-1', kind: 'quest', kindLabel: 'War Council', icon: 'tasks', readAt: null, createdAt: '2026-08-01T13:55:00.000Z' },
  { id: 'n-system', text: 'Đồng bộ dữ liệu đã hoàn tất', route: '/dashboard', kind: 'system', kindLabel: 'Realm Dispatch', icon: 'bell', readAt: generatedAt, createdAt: '2026-08-01T12:00:00.000Z' },
] };
const dataRows = {
  clients: [{ id: 'client-1', name: 'Hội chợ phương Bắc', industry: 'Sự kiện', contact: 'Lan Phạm' }],
  leads: [{ id: 'lead-1', name: 'An Trần', company: 'Hội chợ phương Bắc', email: 'an@example.invalid' }],
  projects: [project], tasks: [task('task-1', 'Khóa sổ chiến dịch Rồng Xanh', '2026-08-03')],
  invoices: [{ id: 'invoice-1', code: 'INV-2026-018', date: '2026-08-01' }], tickets: [], vendors: [], contracts: [],
  users: [{ id: 'user-1', name: 'Minh Quân', email: 'minh@example.invalid', title: 'Quest Master' }],
};
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 1000 }, { name: 'laptop-1024', width: 1024, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 }, { name: 'phone-390', width: 390, height: 844 }, { name: 'phone-375', width: 375, height: 812 },
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
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && ['/api/notifications', '/api/realm-v2/profile-recognition'].includes(url.pathname)) businessMutationRequests.push({ method: request.method(), path: url.pathname });
    });
    await page.route('**/api/data/*', (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').pop();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dataRows[resource] || []) });
    });
    await page.route('**/api/realm-v2/profile-recognition', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) }));
    await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notifications) }));
    await page.route('**/api/collaboration/presence', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? { generatedAt, ttlMs: 70000, people: [], onlineUsers: 0 } : { ok: true, sessionId: 'collab_phase_8_qa' }) }));
    await page.route('**/api/collaboration/contact', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generatedAt, incoming: [], outgoing: [] }) }));
    await page.route('**/api/realm-demo/pilot', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { allowed: true, preference: 'realm', resolvedSurface: 'realm' }, privacy: { aggregateOnly: true, performanceTracking: false } }) }));
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'phase-8-user', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', roles: ['DIRECTOR'] }, expires: '2099-01-01T00:00:00.000Z' }) }));

    for (const slug of ['notifications', 'search', 'settings', 'mobile']) {
      const response = await page.goto(`${baseUrl}/realm-v2/phase-8-qa?screen=${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(750);
      if (slug === 'notifications') await page.getByText('Yêu cầu duyệt ngân sách chiến dịch').waitFor({ state: 'visible' });
      if (slug === 'search') {
        await page.getByRole('searchbox', { name: 'Tìm kiếm toàn hệ thống' }).fill('Rồng Xanh');
        await page.waitForTimeout(1500);
        if (await page.getByRole('option').count() === 0) throw new Error(JSON.stringify({ searchValue: await page.getByRole('searchbox', { name: 'Tìm kiếm toàn hệ thống' }).inputValue(), searchText: (await page.locator('main').innerText()).slice(0, 2000), consoleErrors, failedResponses }));
      }
      if (slug === 'settings') await page.getByRole('heading', { name: 'Workspace mặc định' }).waitFor({ state: 'visible' });
      if (slug === 'mobile') await page.getByText('Khóa sổ chiến dịch Rồng Xanh').waitFor({ state: 'visible' });
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
      await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => { node.style.display = 'none'; }));
      await page.screenshot({ path: path.join(outputDir, `${slug}-${viewport.name}.png`), fullPage: true });
      const mobileNavItems = await page.locator('nav[aria-label="Điều hướng chính trên di động"] a').count();
      const horizontalOverflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      results.push({ slug, viewport: viewport.name, status: response?.status() || null, finalPath: new URL(page.url()).pathname, heading: await page.locator('main h1').textContent(), mobileNavItems, horizontalOverflowPx, consoleErrors: [...consoleErrors], failedResponses: [...failedResponses] });
      consoleErrors.length = 0; failedResponses.length = 0;
    }
    await context.close();
  }
} finally { await browser.close(); }

await fs.writeFile(path.join(outputDir, 'capture-results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, businessMutationRequests }, null, 2)}\n`);
const failures = results.filter((result) => result.status !== 200 || result.finalPath !== '/realm-v2/phase-8-qa' || result.horizontalOverflowPx > 0 || result.mobileNavItems !== 5 || result.consoleErrors.length || result.failedResponses.length);
if (failures.length || businessMutationRequests.length) {
  console.error(JSON.stringify({ failures, businessMutationRequests }, null, 2));
  process.exitCode = 1;
} else console.log(`Phase 8 browser capture passed: ${results.length}/${results.length} views; 0 notification/profile mutations.`);
