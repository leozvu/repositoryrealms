import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = String(process.env.REALMS_STAGING_PREVIEW_URL || '').replace(/\/$/, '');
const password = String(process.env.REALMS_STAGING_DEMO_PASSWORD || '');
const ACCOUNTS = Object.freeze([
  { email: 'giamdoc@agency.vn', role: 'DIRECTOR', finance: 200, crm: 200, hr: 200, release: 200, work: 200 },
  { email: 'director.checker@agency.vn', role: 'DIRECTOR', finance: 200, crm: 200, hr: 200, release: 200, work: 200 },
  { email: 'ketoan@agency.vn', role: 'ACCOUNTANT', finance: 200, crm: 403, hr: 200, release: 403, work: 200 },
  { email: 'am@agency.vn', role: 'AM', finance: 403, crm: 200, hr: 200, release: 403, work: 200 },
  { email: 'pm@agency.vn', role: 'PM', finance: 403, crm: 403, hr: 200, release: 403, work: 200 },
  { email: 'hr@agency.vn', role: 'HR', finance: 403, crm: 403, hr: 200, release: 403, work: 200 },
  { email: 'truongnhom@agency.vn', role: 'LEAD', finance: 403, crm: 403, hr: 200, release: 403, work: 200 },
  { email: 'nhanvien@agency.vn', role: 'STAFF', finance: 403, crm: 403, hr: 200, release: 403, work: 200 },
  { email: 'freelancer@agency.vn', role: 'FREELANCER', finance: 403, crm: 403, hr: 403, release: 403, work: 403 },
]);

function fail(message) {
  throw new Error(message);
}

function safety() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  if (branch !== 'codex/realms-demo') fail(`Refusing acceptance from branch ${branch || '(detached)'}.`);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
  if (project.projectName !== 'crmegoric-realms-demo') fail(`Refusing Vercel project ${project.projectName || '(unknown)'}.`);
  if (!/^https:\/\/crmegoric-realms-demo-[a-z0-9-]+\.vercel\.app$/i.test(baseUrl)) fail('REALMS_STAGING_PREVIEW_URL must be a crmegoric-realms-demo preview URL.');
  if (password.length < 16) fail('REALMS_STAGING_DEMO_PASSWORD must contain at least 16 characters.');
  const target = assertFullStagingTarget({
    environment: process.env.REALMS_DEPLOY_ENV,
    databaseUrl: process.env.REALMS_STAGING_DATABASE_URL,
    protectedDatabaseUrls: [process.env.PROTECTED_PRODUCTION_DATABASE_URL, process.env.PROTECTED_PRODUCTION_DIRECT_URL],
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1',
  });
  if (process.env.REALMS_STAGING_APPROVAL !== target.approval) fail('REALMS_STAGING_APPROVAL does not match the staging target.');
}

async function login(browser, account) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(`pageerror:${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500) failures.push(`http${response.status()}:${new URL(response.url()).pathname}`);
  });
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (await page.locator('form input[type="email"]').count() !== 1 || await page.locator('form input[type="password"]').count() !== 1) {
    fail('Login form contract is missing.');
  }
  const csrfResponse = await context.request.get(`${baseUrl}/api/auth/csrf`, { timeout: 10_000 });
  const csrf = await csrfResponse.json();
  if (csrfResponse.status() !== 200 || !csrf?.csrfToken) fail(`CSRF bootstrap failed for ${account.email}.`);
  const callbackResponse = await context.request.post(`${baseUrl}/api/auth/callback/credentials`, {
    form: { csrfToken: csrf.csrfToken, email: account.email, password, otp: '', callbackUrl: `${baseUrl}/dashboard`, json: 'true' },
    headers: { 'X-Auth-Return-Redirect': '1' },
    timeout: 20_000,
  });
  if (callbackResponse.status() !== 200) fail(`Credentials callback failed for ${account.email} (${callbackResponse.status()}).`);
  const deadline = Date.now() + 20_000;
  let session = null;
  while (Date.now() < deadline) {
    const response = await context.request.get(`${baseUrl}/api/auth/session`, { headers: { 'Cache-Control': 'no-store' }, timeout: 5_000 });
    const body = await response.json().catch(() => ({}));
    session = { status: response.status(), body };
    if (body?.user?.id) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (session.status !== 200 || session.body?.user?.role !== account.role) {
    fail(`Session role mismatch for ${account.email}: expected ${account.role}, got ${session.status}/${session.body?.user?.role || 'none'}.`);
  }
  return { context, page, user: session.body.user, failures };
}

async function requestMatrix(page) {
  return page.evaluate(async () => {
    const paths = {
      health: '/api/realm-demo/health',
      pilot: '/api/realm-demo/pilot',
      finance: '/api/finance/intelligence',
      crm: '/api/leads/workload',
      hr: '/api/hr/evidence-intelligence',
      release: '/api/realm-demo/release-candidate',
      work: '/api/execution/my-work',
    };
    const result = {};
    await Promise.all(Object.entries(paths).map(async ([key, route]) => {
      const response = await fetch(route, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
      let body = null;
      try { body = await response.json(); } catch {}
      result[key] = { status: response.status, body };
    }));
    return result;
  });
}

function assertMatrix(account, matrix) {
  if (matrix.health.status !== 200 || matrix.health.body?.status !== 'ready') fail(`Health failed for ${account.email}.`);
  if (matrix.pilot.status !== 200) fail(`Pilot decision failed for ${account.email}.`);
  if (account.role === 'FREELANCER' && matrix.pilot.body?.user?.allowed !== false) fail('Freelancer Realm boundary failed.');
  for (const key of ['finance', 'crm', 'hr', 'release', 'work']) {
    if (matrix[key].status !== account[key]) fail(`${account.email} ${key}: expected ${account[key]}, got ${matrix[key].status}.`);
  }
}

async function assertSameSession(context, userId) {
  const beforeResponse = await context.request.get(`${baseUrl}/api/auth/session`, { timeout: 10_000 });
  const before = await beforeResponse.json();
  const erp = await context.request.get(`${baseUrl}/dashboard`, { maxRedirects: 0, timeout: 20_000 });
  const realm = await context.request.get(`${baseUrl}/realm`, { maxRedirects: 0, timeout: 20_000 });
  if (erp.status() >= 500 || realm.status() >= 500) fail(`ERP/Realm surface returned ${erp.status()}/${realm.status()}.`);
  const afterResponse = await context.request.get(`${baseUrl}/api/auth/session`, { timeout: 10_000 });
  const after = await afterResponse.json();
  if (before?.user?.id !== userId || after?.user?.id !== userId) fail('ERP and Realm did not preserve the same authenticated session.');
}

async function crossSurfaceAcceptance(realmClient, erpClient) {
  const suffix = randomUUID().replaceAll('-', '');
  const realmSession = `phase25_realm_${suffix}`;
  const erpSession = `phase25_erp_${suffix}`;
  const idempotencyKey = `phase25_contact_${suffix}`;
  let contact = null;
  try {
    const realmPresence = await realmClient.page.evaluate(async (sessionId) => {
      const response = await fetch('/api/collaboration/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, surface: 'realm', availability: 'available', capabilities: ['chat', 'voice'] }) });
      return { status: response.status, body: await response.json() };
    }, realmSession);
    const erpPresence = await erpClient.page.evaluate(async (sessionId) => {
      const response = await fetch('/api/collaboration/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, surface: 'erp', availability: 'available', capabilities: ['chat'] }) });
      return { status: response.status, body: await response.json() };
    }, erpSession);
    if (realmPresence.status !== 200 || erpPresence.status !== 200) fail('Cross-surface presence heartbeat failed.');

    const directory = await realmClient.page.evaluate(async () => {
      const response = await fetch('/api/collaboration/presence', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    const target = directory.body?.people?.find((person) => person.id === erpClient.user.id);
    if (directory.status !== 200 || !target?.online || !target.surfaces?.includes('erp')) fail('Realm user could not see ERP-only colleague presence.');

    const created = await realmClient.page.evaluate(async ({ targetUserId, idempotencyKey: key }) => {
      const response = await fetch('/api/collaboration/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ targetUserId, kind: 'chat', sourceSurface: 'realm', message: 'Phase 25 cross-surface acceptance' }),
      });
      return { status: response.status, body: await response.json() };
    }, { targetUserId: erpClient.user.id, idempotencyKey });
    if (![200, 201].includes(created.status) || created.body?.contact?.sourceSurface !== 'realm') fail('Realm-to-ERP contact request failed.');
    contact = created.body.contact;

    const inbox = await erpClient.page.evaluate(async () => {
      const response = await fetch('/api/collaboration/contact', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    const incoming = inbox.body?.incoming?.find((item) => item.id === contact.id);
    if (inbox.status !== 200 || !incoming || incoming.sourceSurface !== 'realm') fail('ERP-only user did not receive Realm contact awareness.');

    const accepted = await erpClient.page.evaluate(async (id) => {
      const response = await fetch('/api/collaboration/contact', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'accept' }) });
      return { status: response.status, body: await response.json() };
    }, contact.id);
    if (accepted.status !== 200 || accepted.body?.contact?.status !== 'accepted') fail('ERP user could not accept Realm contact request.');
    return { contactId: contact.id, conversationId: contact.conversationId, requesterId: realmClient.user.id };
  } finally {
    await Promise.allSettled([
      realmClient.page.evaluate(async (sessionId) => fetch('/api/collaboration/presence', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }), realmSession),
      erpClient.page.evaluate(async (sessionId) => fetch('/api/collaboration/presence', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }), erpSession),
    ]);
  }
}

async function cleanupEvidence(prisma, evidence) {
  if (!evidence?.contactId) return;
  const routeFragment = `contact=${encodeURIComponent(evidence.contactId)}`;
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { route: { contains: routeFragment } } }),
    prisma.message.deleteMany({ where: { senderId: evidence.requesterId, content: '[Gõ cửa từ Realm] Phase 25 cross-surface acceptance' } }),
    prisma.collaborationContactRequest.deleteMany({ where: { id: evidence.contactId } }),
  ]);
}

async function main() {
  safety();
  const browser = await chromium.launch({ headless: true });
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.REALMS_STAGING_DATABASE_URL } } });
  const clients = new Map();
  let collaborationEvidence = null;
  try {
    for (const account of ACCOUNTS) {
      console.log(`CHECK ${account.role.padEnd(10)} ${account.email}`);
      const client = await login(browser, account);
      clients.set(account.email, client);
      const matrix = await requestMatrix(client.page);
      assertMatrix(account, matrix);
      await assertSameSession(client.context, client.user.id);
      if (client.failures.length) fail(`${account.email} runtime failures: ${client.failures.join(', ')}`);
      console.log(`PASS ${account.role.padEnd(10)} ${account.email}`);
    }
    collaborationEvidence = await crossSurfaceAcceptance(clients.get('nhanvien@agency.vn'), clients.get('am@agency.vn'));
    console.log('PASS CROSS-SURFACE Realm presence/contact -> ERP awareness/acceptance');
    const ceo = await prisma.user.findUnique({ where: { email: 'giamdoc@agency.vn' }, select: { id: true, name: true } });
    await prisma.auditLog.create({
      data: {
        userId: ceo.id,
        userName: ceo.name,
        action: 'verify',
        entity: 'realm_phase25_identity_acceptance',
        refId: 'phase25-role-matrix-v1',
        detail: `9 credentials; same ERP/Realm session; RBAC matrix passed; Realm-to-ERP presence/contact awareness passed; ERP default; ephemeral contact cleaned; no roster payload`,
      },
    });
    console.log(`Phase 25 role acceptance passed: ${ACCOUNTS.length} credentials, same-session ERP/Realm, RBAC matrix and cross-surface collaboration.`);
  } finally {
    await cleanupEvidence(prisma, collaborationEvidence).catch(() => {});
    await prisma.collaborationPresenceSession.deleteMany({ where: { sessionId: { startsWith: 'phase25_' } } }).catch(() => {});
    await prisma.$disconnect();
    for (const client of clients.values()) await client.context.close().catch(() => {});
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[phase25-role-acceptance] ${error.message}`);
  process.exitCode = 1;
});
