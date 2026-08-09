import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.REALM_V2_PHASE_7_URL || 'http://127.0.0.1:3334').replace(/\/$/, '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error('Phase 7 capture is restricted to localhost.');
const outputDir = path.resolve('qa/realm-v2-phase-7');
await fs.mkdir(outputDir, { recursive: true });
const generatedAt = '2026-08-01T14:00:00.000Z';
const browser = await chromium.launch({ headless: true });
const results = [];
const mutationRequests = [];

const task = (id, title, status, project, dueDate, completedAt = null) => ({ id, title, status, priority: 'high', dueDate, queuePosition: 1, updatedAt: generatedAt, completedAt, project, href: `/tasks?focus=${id}&from=realm` });
const projectA = { id: 'project-green-dragon', name: 'Chiến dịch Rồng Xanh', status: 'active', progress: 68, href: '/projects/project-green-dragon' };
const projectB = { id: 'project-alchemist', name: 'Website Nhà Giả Kim', status: 'active', progress: 42, href: '/projects/project-alchemist' };
const entries = [
  { id: 'gold-receipt-003', date: '2026-08-01T11:10:00.000Z', type: 'quest_reward', from: { id: 'pm-1', name: 'Minh Quân' }, to: { id: 'phase-7-user', name: 'Vũ Lương Sơn' }, reason: 'Nghiệm thu chiến dịch Rồng Xanh', contribution: { id: 'task-1', title: 'Khóa sổ chiến dịch Rồng Xanh', href: '/tasks?focus=task-1&from=realm' }, project: projectA, source: { type: 'task', id: 'task-1' }, approver: { id: 'hr-1', name: 'Lan Phạm' }, policy: { period: '2026-08', status: 'approved', personalCap: 45 }, amount: 8, renown: 120, receipt: { id: 'gold-receipt-003', type: 'realm-gold-entry' }, status: 'posted', compensatingCorrection: false },
  { id: 'gold-receipt-002', date: '2026-07-29T09:00:00.000Z', type: 'quest_reward', from: { id: 'pm-1', name: 'Minh Quân' }, to: { id: 'phase-7-user', name: 'Vũ Lương Sơn' }, reason: 'Hoàn tất luồng phê duyệt', contribution: { id: 'task-2', title: 'Chuẩn hóa receipt dự án', href: '/tasks?focus=task-2&from=realm' }, project: projectB, source: { type: 'task', id: 'task-2' }, approver: { id: 'hr-1', name: 'Lan Phạm' }, policy: { period: '2026-08', status: 'approved', personalCap: 45 }, amount: 5, renown: 70, receipt: { id: 'gold-receipt-002', type: 'realm-gold-entry' }, status: 'posted', compensatingCorrection: false },
  { id: 'gold-receipt-001', date: '2026-07-28T15:30:00.000Z', type: 'adjustment', from: { id: null, name: 'RepositoryRealms' }, to: { id: 'phase-7-user', name: 'Vũ Lương Sơn' }, reason: 'Điều chỉnh theo biên bản đối soát', contribution: null, project: null, source: { type: 'manual_review', id: 'ADJ-2026-018' }, approver: null, policy: { period: '2026-08', status: 'approved', personalCap: 45 }, amount: -2, renown: 0, receipt: { id: 'gold-receipt-001', type: 'realm-gold-entry' }, status: 'correction-posted', compensatingCorrection: true },
];
const payload = {
  source: 'erp', generatedAt,
  identity: { id: 'phase-7-user', preferredName: 'Vũ Lương Sơn', pronouns: null, title: 'Giám đốc điều hành', roles: ['DIRECTOR'], team: { id: 'leadership', name: 'Ban điều hành' }, company: 'Egoric Agency', timeZone: null, email: 'ceo@example.invalid', phone: '0900 000 001', avatarHref: '/api/avatar/phase-7-user?v=2', realmClass: 'Realm Architect', realmColor: '#4fa47a', memberSince: '2025-11-01T00:00:00.000Z', availability: { state: 'focus', surface: 'realm', lastSeen: generatedAt, source: 'user-set-presence' }, accessContext: 'self' },
  profile: { currentWork: task('task-current', 'Khóa sổ chiến dịch Rồng Xanh', 'review', projectA, '2026-08-03'), nextWork: task('task-next', 'Chuẩn hóa CEO operating brief', 'todo', projectB, '2026-08-06'), openWorkCount: 4, activeProjects: [projectA, projectB], skills: [{ name: 'Điều hành đa công ty', evidenceHref: null, evidenceState: 'not-linked' }, { name: 'Product strategy', evidenceHref: null, evidenceState: 'not-linked' }, { name: 'Growth operations', evidenceHref: null, evidenceState: 'not-linked' }], contributions: [task('done-1', 'Chốt contract RepositoryRealms', 'done', projectA, '2026-07-30', '2026-07-30T16:00:00.000Z'), task('done-2', 'Duyệt launch readiness', 'done', projectB, '2026-07-27', '2026-07-27T12:00:00.000Z')], preferences: { workspace: 'realm', collaboration: 'user-controlled' }, visibility: { contact: 'self', work: 'authorized-erp-scope', skills: 'self-declared-no-evidence', sensitiveFields: 'excluded' } },
  recognition: { period: '2026-08', summary: { balance: 28, receivedThisPeriod: 8, spentThisPeriod: 0, pendingApproved: 5, personalPolicyCap: 45, personalPolicyRemaining: 37 }, policy: { status: 'approved', companyCap: 140, perUserCap: 45, approvedAt: '2026-08-01T08:00:00.000Z', recognitionUnit: true, payrollEffect: false, rankingEffect: false, appendOnly: true }, permissions: { canOpenRewardControl: true, canConfigure: true, canApprove: true, canManageBudget: true }, ledger: entries },
  links: { canonicalProfile: '/staff/phase-7-user', tasks: '/tasks', projects: '/projects', messages: '/messages', calendar: '/calendar', settings: '/settings', chronicle: '/realm?view=ledger', rewardControl: '/realm?view=ledger' },
  privacy: { scope: 'self', excluded: ['salary', 'hourlyRate', 'reviewScores', 'managerNotes', 'privateNotes'], performanceRanking: false, inferredMood: false },
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
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); });
    page.on('response', (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url().replace(baseUrl, '') }); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && url.pathname === '/api/realm-v2/profile-recognition') mutationRequests.push({ method: request.method(), path: url.pathname });
    });
    await page.route('**/api/realm-v2/profile-recognition', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }));
    await page.route('**/api/avatar/**', (route) => route.fulfill({ status: 204 }));
    await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], unread: 0 }) }));
    await page.route('**/api/collaboration/presence', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? { generatedAt, ttlMs: 70000, people: [], onlineUsers: 0 } : { ok: true, sessionId: 'collab_phase_7_qa' }) }));
    await page.route('**/api/collaboration/contact', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generatedAt, incoming: [], outgoing: [] }) }));
    await page.route('**/api/realm-demo/pilot', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { allowed: true, preference: 'realm' } }) }));
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'phase-7-user', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', roles: ['DIRECTOR'] }, expires: '2099-01-01T00:00:00.000Z' }) }));

    for (const slug of ['employee-profile', 'recognition']) {
      const response = await page.goto(`${baseUrl}/realm-v2/phase-7-qa?screen=${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 15_000 });
      if (slug === 'employee-profile') await page.getByRole('heading', { name: 'Vũ Lương Sơn', exact: true }).waitFor({ state: 'visible' });
      else await page.getByRole('heading', { name: 'Bút toán (3)' }).waitFor({ state: 'visible' });
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
} finally { await browser.close(); }

await fs.writeFile(path.join(outputDir, 'capture-results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, mutationRequests }, null, 2)}\n`);
const failures = results.filter((result) => result.status !== 200 || result.finalPath !== '/realm-v2/phase-7-qa' || result.horizontalOverflowPx > 0 || result.mobileNavItems !== 5 || result.consoleErrors.length || result.failedResponses.length);
if (failures.length || mutationRequests.length) {
  console.error(JSON.stringify({ failures, mutationRequests }, null, 2));
  process.exitCode = 1;
} else console.log(`Phase 7 browser capture passed: ${results.length}/${results.length} views; 0 profile-recognition mutations.`);
