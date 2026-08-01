import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.REALM_V2_PHASE_4_URL || 'http://127.0.0.1:3330').replace(/\/$/, '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error('Phase 4 capture is restricted to localhost.');

const outputDir = path.resolve('qa/realm-v2-phase-4');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const messageChecks = [];
const collaborationChecks = [];
const generatedAt = '2026-07-30T14:00:00.000Z';

const conversations = [
  { id: 'conv-campaign', type: 'group', name: 'Chiến dịch mùa thu', memberCount: 4, unread: 2, lastMsg: { content: 'Khách hàng đã xác nhận phạm vi mới.', senderName: 'Mai Anh', at: generatedAt } },
  { id: 'conv-minh-quan', type: 'dm', name: 'Minh Quân', memberCount: 2, unread: 1, lastMsg: { content: 'Mình đã cập nhật hàng đợi Task.', senderName: 'Minh Quân', at: '2026-07-30T13:42:00.000Z' } },
  { id: 'conv-general', type: 'general', name: 'Kênh chung', memberCount: 8, unread: 0, lastMsg: { content: 'Daily briefing bắt đầu lúc 15:00.', senderName: 'Lan Phạm', at: '2026-07-30T12:10:00.000Z' } },
];
const directory = [
  { id: 'user-mai', name: 'Mai Anh', title: 'Client Lead' },
  { id: 'user-minh', name: 'Minh Quân', title: 'Quest Master' },
  { id: 'user-lan', name: 'Lan Phạm', title: 'Royal Accountant' },
];
const threads = {
  'conv-campaign': { conv: { id: 'conv-campaign', type: 'group', name: 'Chiến dịch mùa thu', members: ['Vũ Lương Sơn', 'Mai Anh', 'Minh Quân', 'Lan Phạm'] }, messages: [
    { id: 'msg-1', senderId: 'user-mai', senderName: 'Mai Anh', content: 'Khách hàng đã xác nhận phạm vi mới và yêu cầu chốt timeline hôm nay.', at: '2026-07-30T13:51:00.000Z' },
    { id: 'msg-2', senderId: 'phase-4-user', senderName: 'Vũ Lương Sơn', content: 'Đã rõ. Hãy gắn quyết định vào Task ERP trước khi triển khai.', at: '2026-07-30T13:56:00.000Z' },
    { id: 'msg-3', senderId: 'user-minh', senderName: 'Minh Quân', content: 'Task đã cập nhật và đang chờ review.', at: generatedAt },
  ] },
};
const notifications = [
  { id: 'notification-1', text: 'Yêu cầu duyệt ngân sách sản xuất quý III đang chờ bạn.', route: '/approvals?focus=approval-1', kind: 'approval', kindLabel: 'Royal Decree', targetLabel: 'phê duyệt', icon: 'shield', readAt: null, createdAt: '2026-07-30T13:58:00.000Z' },
  { id: 'notification-2', text: 'Task chiến dịch mùa thu đã chuyển sang review.', route: '/tasks?focus=task-1', kind: 'quest', kindLabel: 'War Council', targetLabel: 'Task ERP', icon: 'tasks', readAt: generatedAt, createdAt: '2026-07-30T13:20:00.000Z' },
];
const people = [
  { id: 'user-mai', userId: 'user-mai', name: 'Mai Anh', role: 'Client Lead', online: true, availability: 'available', surfaces: ['erp', 'realm'], capabilities: ['chat', 'voice', 'video'], lastSeen: generatedAt },
  { id: 'user-minh', userId: 'user-minh', name: 'Minh Quân', role: 'Quest Master', online: true, availability: 'focus', surfaces: ['realm'], capabilities: ['chat', 'voice'], lastSeen: generatedAt },
  { id: 'user-lan', userId: 'user-lan', name: 'Lan Phạm', role: 'Royal Accountant', online: true, availability: 'dnd', surfaces: ['erp'], capabilities: ['chat'], lastSeen: generatedAt },
  { id: 'user-quang', userId: 'user-quang', name: 'Quang Vũ', role: 'Operations', online: false, availability: 'away', surfaces: [], capabilities: [], lastSeen: null },
];
const contact = (id, direction, status, kind, person, message) => ({
  id, kind, status, sourceSurface: 'realm', message, direction, conversationId: status === 'accepted' ? 'conv-minh-quan' : null,
  requester: direction === 'incoming' ? person : { id: 'phase-4-user', name: 'Vũ Lương Sơn' },
  target: direction === 'incoming' ? { id: 'phase-4-user', name: 'Vũ Lương Sơn' } : person,
  createdAt: generatedAt, expiresAt: '2026-07-30T14:05:00.000Z', seenAt: null, actionAt: null,
});
let incoming = [contact('contact-in-1', 'incoming', 'pending', 'chat', { id: 'user-minh', name: 'Minh Quân' }, 'Cần chốt blocker chiến dịch.')];
let outgoing = [contact('contact-out-1', 'outgoing', 'pending', 'voice', { id: 'user-mai', name: 'Mai Anh' }, 'Review nhanh timeline mới.')];

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
    const sentMessages = [];
    const contactRequests = [];
    await page.route('**/api/chat/**', async (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/').at(-1);
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); sentMessages.push({ id, ...body });
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'msg-phase-4-new', senderId: 'phase-4-user', senderName: 'Vũ Lương Sơn', content: body.content, at: generatedAt }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(threads[id] || { conv: { id, type: 'dm', name: 'Hội thoại', members: ['Vũ Lương Sơn'] }, messages: [] }) });
    });
    await page.route('**/api/chat', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'conv-phase-4-new', ...request.postDataJSON() }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations, totalUnread: 3, directory }) });
    });
    await page.route('**/api/notifications', async (route) => {
      if (route.request().method() === 'PUT') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, changed: 1, unread: 0 }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: notifications, unread: 1 }) });
    });
    await page.route('**/api/collaboration/presence', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generatedAt, ttlMs: 70000, people, onlineUsers: 3 }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sessionId: 'collab_phase_4_qa' }) });
    });
    await page.route('**/api/collaboration/contact', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); contactRequests.push({ ...body, idempotencyKey: request.headers()['idempotency-key'] });
        const created = contact('contact-phase-4-new', 'outgoing', 'pending', body.kind, { id: body.targetUserId, name: 'Mai Anh' }, body.message);
        outgoing = [created, ...outgoing];
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ contact: created, duplicate: false }) });
      }
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON();
        const existing = incoming.find((item) => item.id === body.id);
        const updated = { ...existing, status: body.action === 'accept' ? 'accepted' : 'declined', conversationId: 'conv-minh-quan', actionAt: generatedAt };
        incoming = incoming.filter((item) => item.id !== body.id);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contact: updated, duplicate: false }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generatedAt, incoming, outgoing }) });
    });
    await page.route('**/api/realm-demo/pilot', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { allowed: true, preference: 'realm' } }) }));
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'phase-4-user', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', roles: ['DIRECTOR'] }, expires: '2099-01-01T00:00:00.000Z' }) }));
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)); });
    page.on('response', (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url().replace(baseUrl, '') }); });

    for (const slug of ['inbox', 'collaboration']) {
      const response = await page.goto(`${baseUrl}/realm-v2/phase-4-qa?screen=${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 15_000 });
      if (slug === 'inbox') {
        await page.getByRole('button', { name: /Chiến dịch mùa thu/ }).click();
        await page.getByRole('heading', { name: 'Chiến dịch mùa thu', level: 2 }).waitFor({ state: 'visible' });
      } else {
        await page.getByRole('heading', { name: 'Mai Anh' }).waitFor({ state: 'visible' });
      }
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
      await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => { node.style.display = 'none'; }));
      await page.screenshot({ path: path.join(outputDir, `${slug}-${viewport.name}.png`), fullPage: true });
      const mobileNavItems = await page.locator('nav[aria-label="Điều hướng chính trên di động"] a').count();
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      results.push({
        slug, viewport: viewport.name, status: response?.status() || null, finalPath: new URL(page.url()).pathname,
        heading: await page.locator('main h1').textContent().catch(() => null), mobileNavItems, horizontalOverflowPx: overflow,
        consoleErrors: [...consoleErrors], failedResponses: [...failedResponses],
      });

      if (viewport.name === 'desktop-1440' && slug === 'inbox') {
        await page.getByLabel('Trả lời').fill('Đã nhận. Mình sẽ kiểm tra Task ERP ngay.');
        await page.getByRole('button', { name: 'Gửi vào ERP' }).click();
        await page.getByText('Message record · msg-phase-4-new', { exact: true }).waitFor({ state: 'visible' });
        messageChecks.push({
          conversationId: sentMessages[0]?.id || null,
          content: sentMessages[0]?.content || null,
          recordVisible: await page.getByText('Message record · msg-phase-4-new', { exact: true }).count() === 1,
          directAttachmentControls: await page.getByRole('button', { name: /đính kèm/i }).count(),
        });
      }
      if (viewport.name === 'desktop-1440' && slug === 'collaboration') {
        await page.getByLabel('Lời nhắn').fill('Cần review nhanh timeline chiến dịch.');
        await page.getByRole('button', { name: 'Gửi contact request' }).click();
        await page.getByText(/contact-phase-4-new/).waitFor({ state: 'visible' });
        collaborationChecks.push({
          targetUserId: contactRequests[0]?.targetUserId || null,
          sourceSurface: contactRequests[0]?.sourceSurface || null,
          idempotencyKeyPresent: /^realm-v2-contact:/.test(contactRequests[0]?.idempotencyKey || ''),
          surveillanceCopyVisible: await page.getByText(/Không hiển thị raw heartbeat/).count() === 1,
          fakeCoViewingButtonCount: await page.getByRole('button', { name: /co-view/i }).count(),
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

await fs.writeFile(path.join(outputDir, 'capture-results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, messageChecks, collaborationChecks }, null, 2)}\n`);
const failures = results.filter((result) => result.status !== 200 || result.finalPath !== '/realm-v2/phase-4-qa' || result.horizontalOverflowPx > 0 || result.mobileNavItems !== 5 || result.consoleErrors.length || result.failedResponses.length);
const messageFailure = messageChecks.length !== 1 || messageChecks[0].conversationId !== 'conv-campaign' || !messageChecks[0].content.startsWith('Đã nhận') || !messageChecks[0].recordVisible || messageChecks[0].directAttachmentControls !== 0;
const collaborationFailure = collaborationChecks.length !== 1 || collaborationChecks[0].targetUserId !== 'user-mai' || collaborationChecks[0].sourceSurface !== 'realm' || !collaborationChecks[0].idempotencyKeyPresent || !collaborationChecks[0].surveillanceCopyVisible || collaborationChecks[0].fakeCoViewingButtonCount !== 0;
if (failures.length || messageFailure || collaborationFailure) {
  console.error(JSON.stringify({ failures, messageChecks, collaborationChecks }, null, 2));
  process.exitCode = 1;
} else console.log(`Phase 4 browser capture passed: ${results.length}/${results.length} views.`);
