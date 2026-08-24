import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.REALM_V2_PHASE_6_URL || 'http://127.0.0.1:3333').replace(/\/$/, '');
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error('Phase 6 capture is restricted to localhost.');
const outputDir = path.resolve('qa/realm-v2-phase-6');
await fs.mkdir(outputDir, { recursive: true });
const generatedAt = '2026-07-30T16:00:00.000Z';
const browser = await chromium.launch({ headless: true });
const results = [];
const mutationRequests = [];

const entityRows = [
  ['aim', 'AIM Agency', 'agency', 'fresh', 'VND'],
  ['egoric', 'Egoric Agency', 'agency', 'fresh', 'VND'],
  ['vnecom', 'VNECOM LLC', 'commerce', 'stale', 'USD'],
  ['egolive', 'Egolive', 'livestream', 'fresh', 'VND'],
];

function domains(id) {
  const index = entityRows.findIndex((row) => row[0] === id) + 1;
  return {
    finance: { revenueCash: 420000000 * index, expenseCash: 230000000 * index, cashBalance: 610000000 * index, accountsReceivable: 180000000 * index, accountsPayable: 90000000 * index },
    crm: { pipelineValue: 750000000 * index, pipelineCount: 8 * index, winRate: 32, clients: 14 },
    delivery: { projectsActive: 3 + index, projectsLate: id === 'vnecom' ? 2 : 0, tasksOpen: 12 * index, tasksOverdue: id === 'vnecom' ? 4 : 0 },
    people: { activeHeadcount: 6 * index, includesSalaryOrPayroll: false, employeeRankingEnabled: false },
    ...(id === 'egolive' ? { livestream: { gmvOnStream: 1650000000, netReceivedReconciled: 1210000000, pendingReconciliation: 3, pendingPlatformSettlement: 4, gmvIsRevenue: false } } : {}),
  };
}

const entities = entityRows.map(([id, displayName, businessProfile, state, currency]) => ({
  id, displayName, businessProfile, environment: 'preview', enabled: true, registryStatus: 'active', capabilities: Object.keys(domains(id)),
  freshness: { state, available: true, ageSeconds: state === 'stale' ? 1200 : 45, validationCode: null },
  snapshot: { entityId: id, asOf: generatedAt, currency, domains: domains(id), provenance: { source: 'canonical-entity-database' } },
  provenance: { source: 'CEO aggregate cache', upstreamSource: 'canonical-entity-database', sourceAsOf: generatedAt, fetchedAt: generatedAt },
  sync: { lastSuccessfulAt: generatedAt, consecutiveErrors: id === 'vnecom' ? 1 : 0, lastErrorCode: id === 'vnecom' ? 'upstream_timeout' : null, circuitState: 'open' },
}));

const dashboard = {
  contract: 'repositoryrealms.ceo.dashboard', dashboardVersion: 1, contractVersion: 1, asOf: generatedAt, filter: 'all',
  health: { registered: 4, available: 4, fresh: 3, stale: 1, unavailable: 0 },
  portfolio: {
    finance: { revenueCashByCurrency: [{ currency: 'VND', value: 2940000000 }, { currency: 'USD', value: 1260000000 }], expenseCashByCurrency: [{ currency: 'VND', value: 1610000000 }, { currency: 'USD', value: 690000000 }], cashBalanceByCurrency: [{ currency: 'VND', value: 4270000000 }, { currency: 'USD', value: 1830000000 }], entitiesContributing: 4, accountingProfitClaimed: false },
    delivery: { projectsActive: 26, projectsLate: 2, tasksOpen: 120, tasksOverdue: 4, entitiesContributing: 4 },
    people: { activeHeadcount: 60, entitiesContributing: 4, includesSalaryOrPayroll: false, employeeRankingEnabled: false },
    livestream: { gmvByCurrency: [{ currency: 'VND', value: 1650000000 }], netReceivedByCurrency: [{ currency: 'VND', value: 1210000000 }], pendingReconciliation: 3, entitiesContributing: 1, gmvIsRevenue: false },
  }, entities,
  provenance: { source: 'validated cached CEO v1 entity snapshots', generatedBy: 'RepositoryRealms CEO Portal', caveats: ['Currency totals are grouped and never silently converted.'] },
};

const world = {
  contract: 'repositoryrealms.ceo.federation-world', version: 1, asOf: generatedAt, identity: { stepUp: true },
  kingdoms: entityRows.map(([id, displayName], index) => ({
    id, displayName, realmName: ['The Verdant Guild', 'The Emerald Crown', 'The Mercantile Haven', 'The Ember Arena'][index],
    mapPosition: ['northwest', 'northeast', 'southwest', 'southeast'][index], landmark: 'citadel', environment: 'preview', businessProfile: id,
    gateway: { available: true, redirectPath: '/realm', requiresStepUp: true }, chat: { available: true, href: `/ceo-inbox?entity=${id}`, grantsRecordAccess: false },
    presence: { state: id === 'vnecom' ? 'degraded' : 'available', optedInProfiles: id === 'vnecom' ? 0 : 4 + index, online: id === 'vnecom' ? 0 : 2 + index, people: [] },
    source: { asOf: id === 'vnecom' ? null : generatedAt, ttlMs: 70000, ...(id === 'vnecom' ? { errorCode: 'ceo_federation_presence_unavailable' } : {}) },
  })),
  summary: { registered: 4, gatewaysAvailable: 4, presenceAvailable: 3, online: 9 },
  invariants: { separateEntityRealms: true, ssoGatewayOnly: true, explicitPresenceOptIn: true, crossEntityChatGrantsRecordAccess: false, presenceIsNotProductivity: true },
};

const commands = { version: 1, deliveries: [
  { id: 'cmd-1', targetEntityId: 'vnecom', targetDisplayName: 'VNECOM LLC', action: 'status.request', status: 'pending_confirmation', attemptCount: 1, lastErrorCode: null, createdAt: generatedAt },
  { id: 'cmd-2', targetEntityId: 'egoric', targetDisplayName: 'Egoric Agency', action: 'task.assign', status: 'delivered', attemptCount: 1, receipt: { id: 'RR-020' }, createdAt: generatedAt },
] };

const conversations = { version: 1, conversations: [
  { id: 'conversation-1', targetEntityId: 'egoric', targetDisplayName: 'Egoric Agency', name: 'Điều hành Egoric', status: 'active', lastMessageAt: generatedAt, lastMessage: { senderName: 'Minh Quân', content: 'Báo cáo tuần đã sẵn sàng.' } },
  { id: 'conversation-2', targetEntityId: 'egolive', targetDisplayName: 'Egolive', name: 'Egolive Operations', status: 'active', lastMessageAt: generatedAt, lastMessage: { senderName: 'Lan Phạm', content: 'Đối soát cần kiểm tra.' } },
] };

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
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && url.pathname.startsWith('/api/ceo/v1/')) mutationRequests.push({ method: request.method(), path: url.pathname });
    });
    await page.route('**/api/ceo/v1/dashboard?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard) }));
    await page.route('**/api/ceo/v1/federation/world?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(world) }));
    await page.route('**/api/ceo/v1/command-gateway?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(commands) }));
    await page.route('**/api/ceo/v1/messaging/conversations', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversations) }));
    await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], unread: 0 }) }));
    await page.route('**/api/collaboration/presence', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? { generatedAt, ttlMs: 70000, people: [], onlineUsers: 0 } : { ok: true, sessionId: 'collab_phase_6_qa' }) }));
    await page.route('**/api/collaboration/contact', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ generatedAt, incoming: [], outgoing: [] }) }));
    await page.route('**/api/realm-demo/pilot', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { allowed: true, preference: 'realm' } }) }));
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'phase-6-director', name: 'Vũ Lương Sơn', email: 'ceo@example.invalid', roles: ['DIRECTOR'] }, expires: '2099-01-01T00:00:00.000Z' }) }));

    for (const slug of ['world-map', 'ceo-terminal']) {
      const response = await page.goto(`${baseUrl}/realm-v2/phase-6-qa?screen=${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 15_000 });
      if (slug === 'world-map') await page.getByRole('heading', { name: 'Danh sách công ty tương đương' }).waitFor({ state: 'visible' });
      else await page.getByRole('heading', { name: 'So sánh công ty' }).waitFor({ state: 'visible' });
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
const failures = results.filter((result) => result.status !== 200 || result.finalPath !== '/realm-v2/phase-6-qa' || result.horizontalOverflowPx > 0 || result.mobileNavItems !== 5 || result.consoleErrors.length || result.failedResponses.length);
if (failures.length || mutationRequests.length) {
  console.error(JSON.stringify({ failures, mutationRequests }, null, 2));
  process.exitCode = 1;
} else console.log(`Phase 6 browser capture passed: ${results.length}/${results.length} views; 0 CEO mutations.`);
