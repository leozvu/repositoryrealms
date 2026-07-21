import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectFile = path.join(root, '.vercel', 'project.json');
const buildFile = path.join(root, '.next', 'BUILD_ID');
const port = Number(process.env.REALMS_STAGING_SMOKE_PORT || 3417);
const baseUrl = `http://127.0.0.1:${port}`;

function fail(message) {
  throw new Error(message);
}

function verifyRepositorySafety() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  if (branch !== 'codex/realms-demo') fail(`Refusing staging smoke from branch ${branch || '(detached)'}.`);
  if (!fs.existsSync(projectFile)) fail('Missing .vercel/project.json.');
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  if (project.projectName !== 'crmegoric-realms-demo') fail(`Refusing Vercel project ${project.projectName || '(unknown)'}.`);
  if (!fs.existsSync(buildFile)) fail('Missing local production build. Run npm run build first.');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('REALMS_STAGING_SMOKE_PORT must be a safe local port.');
  return { branch, project: project.projectName };
}

function verifyTarget() {
  const target = assertFullStagingTarget({
    environment: process.env.REALMS_DEPLOY_ENV,
    databaseUrl: process.env.REALMS_STAGING_DATABASE_URL,
    protectedDatabaseUrls: [
      process.env.DATABASE_URL,
      process.env.DIRECT_URL,
      process.env.PROTECTED_PRODUCTION_DATABASE_URL,
      process.env.PROTECTED_PRODUCTION_DIRECT_URL,
    ],
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1',
  });
  if (process.env.REALMS_STAGING_APPROVAL !== target.approval) {
    fail('REALMS_STAGING_APPROVAL does not match the resolved staging target.');
  }
  return target;
}

function collectOutput(child) {
  const lines = [];
  const append = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      lines.push(line);
      if (lines.length > 80) lines.shift();
    }
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  return lines;
}

async function waitForServer(child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`Local production server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
      if (response.status === 200) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  fail('Local production server did not become ready within 60 seconds.');
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function findMyWorkTask(payload, taskId) {
  return Object.values(payload?.queues || {}).flat().find((task) => task.id === taskId) || null;
}

async function runBrowserSmoke({ email, password, taskId, projectId, leadIds, financeIds, hrIds }) {
  const browser = await chromium.launch({ headless: true });
  const runtimeFailures = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => runtimeFailures.push(`pageerror:${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) runtimeFailures.push(`http${response.status()}:${response.url()}`);
    });

    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });

    const session = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session');
      return { status: response.status, body: await response.json() };
    });
    if (session.status !== 200 || session.body?.user?.role !== 'DIRECTOR') fail(`Session contract failed (${session.status}).`);

    const myWork = await page.evaluate(async () => {
      const response = await fetch('/api/execution/my-work', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    if (myWork.status !== 200 || myWork.body?.source !== 'erp-task' || !myWork.body?.queues || myWork.body?.queue?.ownerId !== session.body.user.id) {
      fail(`My Work API contract failed (${myWork.status}).`);
    }
    const initialTask = findMyWorkTask(myWork.body, taskId);
    if (!initialTask || initialTask.workVersion !== 1 || initialTask.intelligence?.actual?.source !== 'declared_timelog') {
      fail('Resource Intelligence initial My Work contract failed.');
    }
    if (initialTask.intelligence?.actual?.isObservedTruth !== false || myWork.body?.resourceIntelligence?.confidenceCeiling !== 'medium') {
      fail('Resource Intelligence provenance or confidence ceiling failed.');
    }

    const idempotencyKey = `resource-smoke:${crypto.randomUUID()}`;
    const estimate = await page.evaluate(async ({ entityId, key }) => {
      const response = await fetch('/api/execution/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          action: 'task.estimate',
          entityId,
          expectedVersion: 1,
          estimateKind: 'declared',
          estimateHours: 3.5,
          workType: 'design',
          complexity: 'medium',
          note: 'Ephemeral staging contract check',
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { entityId: taskId, key: idempotencyKey });
    if (estimate.status !== 200 || estimate.body?.action?.type !== 'task.estimate'
      || estimate.body?.repository?.name !== 'RepositoryRealms'
      || estimate.body?.repository?.invariants?.receipt !== 'verified') {
      fail(`Resource Intelligence canonical action failed (${estimate.status}).`);
    }

    const replay = await page.evaluate(async ({ entityId, key }) => {
      const response = await fetch('/api/execution/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          action: 'task.estimate', entityId, expectedVersion: 1, estimateKind: 'declared',
          estimateHours: 3.5, workType: 'design', complexity: 'medium',
          note: 'Ephemeral staging contract check',
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { entityId: taskId, key: idempotencyKey });
    if (replay.status !== 200 || replay.body?.idempotent !== true
      || replay.body?.repository?.receiptId !== estimate.body?.repository?.receiptId) {
      fail(`Resource Intelligence idempotent replay failed (${replay.status}).`);
    }

    const refreshedMyWork = await page.evaluate(async () => {
      const response = await fetch('/api/execution/my-work', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    const estimatedTask = findMyWorkTask(refreshedMyWork.body, taskId);
    if (refreshedMyWork.status !== 200 || estimatedTask?.estHours !== 3.5
      || estimatedTask?.workVersion !== 2 || estimatedTask?.workType !== 'design'
      || estimatedTask?.complexity !== 'medium'
      || estimatedTask?.intelligence?.estimate?.source !== 'employee_declared') {
      fail('Resource Intelligence enriched read model failed after estimate action.');
    }

    const teamWork = await page.evaluate(async () => {
      const response = await fetch('/api/execution/team-work', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    if (teamWork.status !== 200 || teamWork.body?.source !== 'erp-task' || !Array.isArray(teamWork.body?.members)) {
      fail(`Team Work API contract failed (${teamWork.status}).`);
    }
    if (teamWork.body?.policy?.employeeRanking !== false || teamWork.body?.policy?.presenceAsProductivity !== false) {
      fail('Team Work privacy policy contract failed.');
    }
    if (teamWork.body?.resourceIntelligence?.employeeRanking !== false
      || teamWork.body?.resourceIntelligence?.confidenceCeiling !== 'medium') {
      fail('Team Work Resource Intelligence aggregate policy failed.');
    }

    const projectHealth = await page.evaluate(async (id) => {
      const response = await fetch(`/api/projects/${id}/execution-health`, { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    }, projectId);
    if (projectHealth.status !== 200 || projectHealth.body?.source !== 'canonical-erp-project'
      || projectHealth.body?.project?.id !== projectId
      || projectHealth.body?.executionHealth?.ruleVersion !== 'project-execution-health-v1') {
      fail(`Project Execution Health API contract failed (${projectHealth.status}).`);
    }
    const executionHealth = projectHealth.body.executionHealth;
    if (executionHealth?.resource?.actualSource !== 'declared_timelog'
      || executionHealth?.resource?.actualIsObservedTruth !== false
      || executionHealth?.health?.confidence?.ceiling !== 'medium') {
      fail('Project evidence provenance or confidence ceiling failed.');
    }
    if (executionHealth?.delivery?.blocked < 1 || executionHealth?.delivery?.unresolvedDependencies < 1
      || executionHealth?.policy?.employeeRanking !== false
      || executionHealth?.policy?.presenceAsProductivity !== false) {
      fail('Project delivery constraints or anti-ranking policy failed.');
    }
    if (!projectHealth.body.canSeeMoney || !executionHealth.financial
      || executionHealth.financial.isAccountingProfit !== false
      || executionHealth.provenance?.finance !== 'planning_proxy_not_accounting_profit') {
      fail('Project finance authorization/proxy contract failed.');
    }

    const crmWorkload = await page.evaluate(async () => {
      const response = await fetch('/api/leads/workload', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    if (crmWorkload.status !== 200 || crmWorkload.body?.source !== 'canonical-erp-crm'
      || crmWorkload.body?.workloadIntelligence?.ruleVersion !== 'crm-workload-intelligence-v1') {
      fail(`CRM Workload Intelligence API contract failed (${crmWorkload.status}).`);
    }
    const crm = crmWorkload.body.workloadIntelligence;
    const crmFixtures = Object.fromEntries(crm.leads.filter((lead) => Object.values(leadIds).includes(lead.id)).map((lead) => [lead.id, lead]));
    if (crmFixtures[leadIds.active]?.lifecycle?.band !== 'active'
      || crmFixtures[leadIds.stale]?.lifecycle?.band !== 'stale'
      || crmFixtures[leadIds.dormant]?.lifecycle?.band !== 'dormant') {
      fail('CRM lifecycle classification failed for active/stale/dormant staging fixtures.');
    }
    if (crm.policy?.employeeRanking !== false || crm.policy?.automaticAssignment !== false
      || crm.policy?.activityIsObservedTruth !== false || crmFixtures[leadIds.active]?.confidence?.ceiling !== 'medium') {
      fail('CRM workload governance contract failed.');
    }
    if (JSON.stringify(crmFixtures).includes('phase4-secret@example.invalid') || JSON.stringify(crmFixtures).includes('0900999888')) {
      fail('CRM workload leaked contact details.');
    }

    const realmEmbassy = await page.evaluate(async () => {
      const response = await fetch('/api/realm-demo/embassy', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    if (realmEmbassy.status !== 200 || realmEmbassy.body?.source !== 'erp'
      || realmEmbassy.body?.workloadIntelligence?.ruleVersion !== crm.ruleVersion
      || realmEmbassy.body?.workloadIntelligence?.policy?.employeeRanking !== false) {
      fail(`Royal Embassy shared CRM workload contract failed (${realmEmbassy.status}).`);
    }

    const financeIntelligence = await page.evaluate(async () => {
      const response = await fetch('/api/finance/intelligence', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    if (financeIntelligence.status !== 200 || financeIntelligence.body?.source !== 'canonical-erp-finance'
      || financeIntelligence.body?.financialIntelligence?.ruleVersion !== 'financial-operating-intelligence-v1') {
      fail(`Financial Operating Intelligence API contract failed (${financeIntelligence.status}).`);
    }
    const financial = financeIntelligence.body.financialIntelligence;
    const projectEconomics = financial.projects.find((project) => project.projectId === projectId);
    if (!projectEconomics || projectEconomics.declaredHours !== 1.25
      || projectEconomics.invoiced !== 2_000_000 || projectEconomics.vendorCommitted !== 500_000
      || projectEconomics.laborAccrued !== 125_000 || projectEconomics.operatingMarginProxy !== 1_375_000) {
      fail(`Financial project economics failed (${JSON.stringify(projectEconomics)}).`);
    }
    if (financial.summary?.isAccountingProfit !== false || financial.policy?.accountingProfit !== false
      || financial.policy?.employeeRanking !== false || financial.policy?.automaticPayment !== false
      || financial.provenance?.activityIsObservedTruth !== false || financial.provenance?.confidence?.ceiling !== 'low') {
      fail('Financial governance/provenance contract failed.');
    }
    if (!financial.managerQueue.some((item) => item.entityId === financeIds.invoiceId && item.action === 'review_receivable')
      || !financial.managerQueue.some((item) => item.entityId === financeIds.vendorBillId && item.action === 'review_payable')
      || !financial.managerQueue.some((item) => item.projectId === projectId && item.action === 'review_unbilled_hours')) {
      fail('Financial Manager Queue did not surface overdue AR/AP and unbilled hours fixtures.');
    }
    if (JSON.stringify(financeIntelligence.body).includes('17600000')
      || JSON.stringify(financeIntelligence.body).includes('salary')
      || JSON.stringify(financeIntelligence.body).includes('hourlyRate')) {
      fail('Financial Intelligence leaked salary or rate details.');
    }

    const realmTreasury = await page.evaluate(async () => {
      const response = await fetch('/api/realm-demo/treasury', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    if (realmTreasury.status !== 200 || realmTreasury.body?.source !== 'erp'
      || realmTreasury.body?.financialIntelligence?.ruleVersion !== financial.ruleVersion
      || realmTreasury.body?.financialIntelligence?.summary?.operatingMarginProxy !== financial.summary.operatingMarginProxy) {
      fail(`Royal Ledger shared Financial Intelligence contract failed (${realmTreasury.status}).`);
    }

    const hrEvidenceResponse = await page.evaluate(async () => {
      const response = await fetch('/api/hr/evidence-intelligence', { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    if (hrEvidenceResponse.status !== 200 || hrEvidenceResponse.body?.source !== 'canonical-erp-hr'
      || hrEvidenceResponse.body?.hrEvidenceIntelligence?.ruleVersion !== 'hr-evidence-outcome-v1.0.0') {
      fail(`HR Evidence Intelligence API contract failed (${hrEvidenceResponse.status}).`);
    }
    const hrEvidence = hrEvidenceResponse.body.hrEvidenceIntelligence;
    const hrDossier = hrEvidence.dossiers.find((row) => row.person.id === hrIds.userId);
    if (!hrDossier || hrDossier.layers.presence.facts.recordedDays !== 1
      || hrDossier.layers.activity.facts.declaredHours !== 1.25
      || hrDossier.layers.output.facts.completedTasks !== 1
      || hrDossier.layers.outcome.facts.personalOkrs !== 1
      || hrDossier.layers.outcome.facts.reviewStatus !== 'self_done') {
      fail(`HR Evidence four-layer dossier failed (${JSON.stringify(hrDossier)}).`);
    }
    if (hrEvidence.policy?.compositePerformanceScore !== false
      || hrEvidence.policy?.employeeRanking !== false
      || hrEvidence.policy?.presenceAsProductivity !== false
      || hrEvidence.policy?.automaticHrDecision !== false
      || hrEvidence.provenance?.evidenceLedgerUsed !== false) {
      fail('HR Evidence governance/provenance contract failed.');
    }
    if (!hrEvidence.verificationQueue.some((item) => item.id === `review-waiting:${hrIds.userId}`)
      || !hrEvidence.verificationQueue.some((item) => item.id === `completion-receipt:${hrIds.userId}`)
      || !hrEvidence.verificationQueue.some((item) => item.id === `outcome-validation:${hrIds.userId}`)) {
      fail('HR Evidence Manager Validation Queue did not surface staging gaps.');
    }
    if (JSON.stringify(hrEvidenceResponse.body).includes('phase6-private-manager-note')
      || JSON.stringify(hrEvidenceResponse.body).includes('phase6-private-self-note')
      || JSON.stringify(hrEvidenceResponse.body).includes('17600000')) {
      fail('HR Evidence response leaked private review notes or salary.');
    }

    // Authenticated app routes poll notifications/presence, so networkidle is not a
    // valid readiness signal. The API contracts above plus the rendered heading are.
    await page.goto(`${baseUrl}/myday`, { waitUntil: 'domcontentloaded' });
    const myHeadingElement = page.locator('header').filter({ hasText: 'Personal execution cockpit' }).locator('h1');
    await myHeadingElement.waitFor({ state: 'visible' });
    const myHeading = await myHeadingElement.textContent();
    if (myHeading?.trim() !== 'Việc của tôi' && !myHeading?.includes('nhịp làm việc')) fail('My Work UI heading is missing.');
    await page.getByText('Estimate ≠ TimeLog ≠ Historical', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('Realms Resource Intelligence smoke', { exact: true }).waitFor({ state: 'visible' });

    await page.goto(`${baseUrl}/teamwork`, { waitUntil: 'domcontentloaded' });
    const teamHeading = page.locator('#view').getByRole('heading', { level: 1, name: 'Điều phối công việc', exact: true });
    await teamHeading.waitFor({ state: 'visible' });
    await page.getByText('Resource Intelligence · shadow mode', { exact: true }).waitFor({ state: 'visible' });

    await page.goto(`${baseUrl}/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Project Execution Health', { exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 1, name: 'Realms Project Health smoke', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 2, name: 'Estimate ≠ TimeLog', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 2, name: 'Planning margin proxy', exact: true }).waitFor({ state: 'visible' });
    const drillDown = page.locator('details').filter({ hasText: 'Execution drill-down' });
    if (await drillDown.getAttribute('open') !== null) fail('Project task drill-down must be closed by default.');

    await page.goto(`${baseUrl}/leads`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Năng lực sales đang được dùng đúng chỗ chưa?', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 2, name: 'Việc cần quyết định', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 2, name: 'Capacity theo lead WIP', exact: true }).waitFor({ state: 'visible' });
    const pipelineDrillDown = page.locator('details').filter({ hasText: 'Pipeline & forecast drill-down' });
    if (await pipelineDrillDown.getAttribute('open') !== null) fail('CRM pipeline drill-down must be closed by default.');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Năng lực sales đang được dùng đúng chỗ chưa?', exact: true }).waitFor({ state: 'visible' });
    const mobileCrm = await page.evaluate(() => ({
      headingVisible: Boolean(document.querySelector('h1')?.getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    if (!mobileCrm.headingVisible || mobileCrm.overflow > 2) fail(`Mobile CRM Workload layout failed (${JSON.stringify(mobileCrm)}).`);

    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${baseUrl}/finance`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Mỗi giờ làm tạo ra bao nhiêu giá trị và lợi nhuận?', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 2, name: 'Việc tài chính cần quyết định', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 2, name: 'Lịch tiền 3 tháng', exact: true }).waitFor({ state: 'visible' });
    const financeLedger = page.locator('details').filter({ hasText: 'Sổ quỹ & giao dịch' });
    const projectEconomicsDrilldown = page.locator('details').filter({ hasText: 'Project economics drill-down' });
    if (await financeLedger.getAttribute('open') !== null || await projectEconomicsDrilldown.getAttribute('open') !== null) {
      fail('Finance ledger and project economics drill-downs must be closed by default.');
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Mỗi giờ làm tạo ra bao nhiêu giá trị và lợi nhuận?', exact: true }).waitFor({ state: 'visible' });
    const mobile = await page.evaluate(() => ({
      headingVisible: Boolean(document.querySelector('h1')?.getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    if (!mobile.headingVisible || mobile.overflow > 2) fail(`Mobile Financial Intelligence layout failed (${JSON.stringify(mobile)}).`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/reviews`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Bằng chứng nào đã được xác nhận trước khi đánh giá?', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 2, name: 'Bốn lớp độc lập, không cộng thành một điểm', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { level: 2, name: 'Việc cần xác minh trước khi kết luận', exact: true }).waitFor({ state: 'visible' });
    const evidenceDossiers = page.locator('details').filter({ hasText: 'Evidence dossier theo nhân sự' });
    if (await evidenceDossiers.getAttribute('open') !== null) fail('HR Evidence dossiers must be closed by default.');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Bằng chứng nào đã được xác nhận trước khi đánh giá?', exact: true }).waitFor({ state: 'visible' });
    const mobileHr = await page.evaluate(() => ({
      headingVisible: Boolean(document.querySelector('h1')?.getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    if (!mobileHr.headingVisible || mobileHr.overflow > 2) fail(`Mobile HR Evidence layout failed (${JSON.stringify(mobileHr)}).`);
    if (runtimeFailures.length) fail(`Runtime failures: ${runtimeFailures.join('; ')}`);

    return {
      teamMembers: teamWork.body.members.length,
      openTasks: teamWork.body.metrics.open,
      receiptId: estimate.body.repository.receiptId,
      projectHealth: executionHealth.health.level,
      crmQueue: crm.summary.managerQueueItems,
      financeQueue: financial.summary.managerQueueItems,
      hrQueue: hrEvidence.summary.verificationItems,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const repository = verifyRepositorySafety();
  const target = verifyTarget();
  const email = `realms-smoke-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const databaseUrl = process.env.REALMS_STAGING_DATABASE_URL;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let server;
  let serverOutput = [];
  let createdUserId = null;
  let createdTaskId = null;
  let createdBlockedTaskId = null;
  let createdProjectId = null;
  let createdPhaseId = null;
  let createdMilestoneId = null;
  let createdTimeLogId = null;
  let createdEvidenceTaskId = null;
  let createdAttendanceId = null;
  let createdOkrId = null;
  let createdReviewId = null;
  let createdClientId = null;
  let createdInvoiceId = null;
  let createdVendorId = null;
  let createdVendorBillId = null;
  let createdBudgetId = null;
  let createdRecurringExpenseId = null;
  const createdTransactionIds = [];
  const createdLeadIds = [];
  const createdActivityIds = [];
  const financeCategory = `Realms QA ${randomUUID()}`;
  try {
    const createdUser = await prisma.user.create({
      data: {
        email,
        name: 'Realms Staging Smoke',
        passwordHash: await bcrypt.hash(password, 10),
        role: 'DIRECTOR',
        roles: JSON.stringify(['DIRECTOR']),
        title: 'Ephemeral QA account',
        salary: 17_600_000,
        workspacePreference: 'erp',
      },
      select: { id: true },
    });
    createdUserId = createdUser.id;
    const createdClient = await prisma.client.create({
      data: { name: 'Realms Financial Intelligence smoke', createdAt: new Date().toISOString().slice(0, 10) },
      select: { id: true },
    });
    createdClientId = createdClient.id;
    const createdProject = await prisma.project.create({
      data: {
        name: 'Realms Project Health smoke',
        clientId: createdClient.id,
        service: 'Internal QA',
        budget: 5_000_000,
        budgetHours: 24,
        status: 'active',
        startDate: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        autoProgress: true,
      },
      select: { id: true },
    });
    createdProjectId = createdProject.id;
    const createdPhase = await prisma.phase.create({
      data: { projectId: createdProject.id, name: 'Execution', order: 0, color: '#7c5a35' },
      select: { id: true },
    });
    createdPhaseId = createdPhase.id;
    const createdMilestone = await prisma.milestone.create({
      data: {
        projectId: createdProject.id,
        name: 'QA acceptance',
        date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        done: false,
      },
      select: { id: true },
    });
    createdMilestoneId = createdMilestone.id;
    const createdTask = await prisma.task.create({
      data: {
        title: 'Realms Resource Intelligence smoke',
        projectId: createdProject.id,
        phaseId: createdPhase.id,
        assigneeId: createdUser.id,
        status: 'todo',
        priority: 'medium',
        estHours: 0,
        workVersion: 1,
        queuePosition: 0,
      },
      select: { id: true },
    });
    createdTaskId = createdTask.id;
    const createdBlockedTask = await prisma.task.create({
      data: {
        title: 'Realms Project dependency smoke',
        projectId: createdProject.id,
        phaseId: createdPhase.id,
        assigneeId: createdUser.id,
        status: 'blocked',
        priority: 'high',
        estHours: 2,
        dependsOn: JSON.stringify([createdTask.id]),
        blockReason: 'Waiting for the canonical prerequisite',
        workVersion: 1,
        queuePosition: 1,
      },
      select: { id: true },
    });
    createdBlockedTaskId = createdBlockedTask.id;
    const createdTimeLog = await prisma.timeLog.create({
      data: {
        userId: createdUser.id,
        projectId: createdProject.id,
        taskId: createdTask.id,
        date: new Date().toISOString().slice(0, 10),
        hours: 1.25,
        billable: true,
        note: 'Ephemeral declared TimeLog for Project Health smoke',
      },
      select: { id: true },
    });
    createdTimeLogId = createdTimeLog.id;

    const current = new Date();
    const currentQuarter = `${current.getUTCFullYear()}-Q${Math.floor(current.getUTCMonth() / 3) + 1}`;
    const createdEvidenceTask = await prisma.task.create({
      data: {
        title: 'Realms HR Evidence output smoke',
        projectId: createdProject.id,
        phaseId: createdPhase.id,
        assigneeId: createdUser.id,
        status: 'done',
        priority: 'medium',
        estHours: 1,
        completedAt: current,
        workVersion: 1,
        queuePosition: 2,
      },
      select: { id: true },
    });
    createdEvidenceTaskId = createdEvidenceTask.id;
    const createdAttendance = await prisma.attendance.create({
      data: { userId: createdUser.id, date: current.toISOString().slice(0, 10), status: 'remote', note: 'Ephemeral HR Evidence staging fixture' },
      select: { id: true },
    });
    createdAttendanceId = createdAttendance.id;
    const createdOkr = await prisma.okr.create({
      data: { userId: createdUser.id, quarter: currentQuarter, title: 'Realms HR Evidence outcome smoke', target: 10, current: 8, unit: 'acceptance points' },
      select: { id: true },
    });
    createdOkrId = createdOkr.id;
    const createdReview = await prisma.review.create({
      data: {
        userId: createdUser.id,
        quarter: currentQuarter,
        status: 'self_done',
        scores: '[{"name":"QA","self":4,"mgr":0}]',
        selfNote: 'phase6-private-self-note',
        mgrNote: 'phase6-private-manager-note',
      },
      select: { id: true },
    });
    createdReviewId = createdReview.id;

    const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const activeLead = await prisma.lead.create({
      data: {
        name: 'Realms CRM Active smoke', company: 'Active Embassy QA', email: 'phase4-secret@example.invalid',
        phone: '0900999888', source: 'Staging smoke', value: 10_000_000, stage: 'proposal',
        ownerId: createdUser.id, createdAt: day(-5), expectedClose: day(10),
      },
      select: { id: true },
    });
    createdLeadIds.push(activeLead.id);
    const staleLead = await prisma.lead.create({
      data: {
        name: 'Realms CRM Stale smoke', company: 'Stale Embassy QA', source: 'Staging smoke',
        value: 5_000_000, stage: 'new', ownerId: null, createdAt: day(-16), expectedClose: day(7),
      },
      select: { id: true },
    });
    createdLeadIds.push(staleLead.id);
    const dormantLead = await prisma.lead.create({
      data: {
        name: 'Realms CRM Dormant smoke', company: 'Dormant Embassy QA', source: 'Staging smoke',
        value: 3_000_000, stage: 'contacted', ownerId: createdUser.id, createdAt: day(-45), expectedClose: day(-5),
      },
      select: { id: true },
    });
    createdLeadIds.push(dormantLead.id);
    const completedActivity = await prisma.activity.create({
      data: { kind: 'call', refType: 'lead', refId: activeLead.id, title: 'Completed CRM evidence smoke', date: day(-1), done: true, userId: createdUser.id },
      select: { id: true },
    });
    createdActivityIds.push(completedActivity.id);
    const overdueActivity = await prisma.activity.create({
      data: { kind: 'meeting', refType: 'lead', refId: staleLead.id, title: 'Overdue CRM follow-up smoke', date: day(-3), done: false, userId: createdUser.id },
      select: { id: true },
    });
    createdActivityIds.push(overdueActivity.id);

    const createdInvoice = await prisma.invoice.create({
      data: {
        code: `INV-REALMS-${randomUUID().slice(0, 8)}`,
        clientId: createdClient.id,
        projectId: createdProject.id,
        items: JSON.stringify([{ desc: 'Financial Intelligence staging fixture', qty: 1, price: 2_000_000 }]),
        vat: 0,
        status: 'sent',
        date: day(-20),
        dueDate: day(-5),
        payments: '[]',
        currency: 'VND',
        fxRate: 1,
      },
      select: { id: true },
    });
    createdInvoiceId = createdInvoice.id;
    const createdVendor = await prisma.vendor.create({
      data: { name: `Realms Finance Vendor ${randomUUID().slice(0, 8)}`, type: 'QA fixture' },
      select: { id: true },
    });
    createdVendorId = createdVendor.id;
    const createdVendorBill = await prisma.vendorBill.create({
      data: {
        code: `VB-REALMS-${randomUUID().slice(0, 8)}`,
        vendorId: createdVendor.id,
        projectId: createdProject.id,
        desc: 'Financial Intelligence staging fixture',
        amount: 500_000,
        date: day(-15),
        dueDate: day(-3),
        status: 'approved',
      },
      select: { id: true },
    });
    createdVendorBillId = createdVendorBill.id;
    const createdTransactions = await prisma.$transaction([
      prisma.transaction.create({
        data: { type: 'income', category: financeCategory, amount: 1_000_000, date: day(-2), desc: 'Financial Intelligence smoke income', projectId: createdProject.id, createdById: createdUser.id },
        select: { id: true },
      }),
      prisma.transaction.create({
        data: { type: 'expense', category: financeCategory, amount: 250_000, date: day(-1), desc: 'Financial Intelligence smoke expense', projectId: createdProject.id, createdById: createdUser.id },
        select: { id: true },
      }),
    ]);
    createdTransactionIds.push(...createdTransactions.map((row) => row.id));
    const createdBudget = await prisma.budget.create({
      data: { month: day(0).slice(0, 7), category: financeCategory, amount: 200_000 },
      select: { id: true },
    });
    createdBudgetId = createdBudget.id;
    const createdRecurringExpense = await prisma.recurringExpense.create({
      data: { category: financeCategory, amount: 100_000, note: 'Financial Intelligence staging fixture', dayOfMonth: 15, active: true },
      select: { id: true },
    });
    createdRecurringExpenseId = createdRecurringExpense.id;

    server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        NEXTAUTH_URL: baseUrl,
        NEXTAUTH_SECRET: randomBytes(32).toString('base64url'),
        REALM_ERP_SYNC_ENABLED: '1',
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    serverOutput = collectOutput(server);
    await waitForServer(server);
    const result = await runBrowserSmoke({
      email,
      password,
      taskId: createdTask.id,
      projectId: createdProject.id,
      leadIds: { active: activeLead.id, stale: staleLead.id, dormant: dormantLead.id },
      financeIds: { invoiceId: createdInvoice.id, vendorBillId: createdVendorBill.id },
      hrIds: { userId: createdUser.id },
    });
    console.log(`Staging execution smoke passed: auth, Resource Intelligence, Project Health, CRM Workload, Financial Intelligence and HR Evidence API/UI, desktop and mobile.`);
    console.log(`Observed ${result.teamMembers} team members and ${result.openTasks} open ERP Tasks through the shared read model.`);
    console.log(`RepositoryRealms receipt verified for the ephemeral estimate action: ${result.receiptId}.`);
    console.log(`Project Health resolved ${result.projectHealth} with blocker/dependency and declared-TimeLog provenance.`);
    console.log(`CRM Workload and Royal Embassy shared one rule engine with ${result.crmQueue} manager-queue item(s).`);
    console.log(`Financial Intelligence and Royal Ledger shared one rule engine with ${result.financeQueue} manager-queue item(s).`);
    console.log(`HR Evidence kept four layers separate with ${result.hrQueue} verification-queue item(s).`);
    console.log(`Target ${target.redactedUrl}; branch ${repository.branch}; project ${repository.project}.`);
  } catch (error) {
    if (serverOutput.length) console.error(`Local server tail:\n${serverOutput.join('\n')}`);
    throw error;
  } finally {
    await stopServer(server);
    if (createdUserId) {
      const [receipts, timeLogs, attendance, okrs, reviews, tasks, milestones, phases, invoices, vendorBills, transactions, budgets, recurringExpenses, projects, vendors, clients, activities, leads, , , removed] = await prisma.$transaction([
        prisma.realmActionReceipt.deleteMany({ where: { userId: createdUserId, entityId: createdTaskId || undefined } }),
        prisma.timeLog.deleteMany({ where: { id: createdTimeLogId || undefined, userId: createdUserId } }),
        prisma.attendance.deleteMany({ where: { id: createdAttendanceId || undefined, userId: createdUserId } }),
        prisma.okr.deleteMany({ where: { id: createdOkrId || undefined, userId: createdUserId } }),
        prisma.review.deleteMany({ where: { id: createdReviewId || undefined, userId: createdUserId } }),
        prisma.task.deleteMany({ where: { id: { in: [createdTaskId, createdBlockedTaskId, createdEvidenceTaskId].filter(Boolean) }, assigneeId: createdUserId } }),
        prisma.milestone.deleteMany({ where: { id: createdMilestoneId || undefined, projectId: createdProjectId || undefined } }),
        prisma.phase.deleteMany({ where: { id: createdPhaseId || undefined, projectId: createdProjectId || undefined } }),
        prisma.invoice.deleteMany({ where: { id: { in: [createdInvoiceId].filter(Boolean) } } }),
        prisma.vendorBill.deleteMany({ where: { id: { in: [createdVendorBillId].filter(Boolean) } } }),
        prisma.transaction.deleteMany({ where: { id: { in: createdTransactionIds } } }),
        prisma.budget.deleteMany({ where: { id: { in: [createdBudgetId].filter(Boolean) } } }),
        prisma.recurringExpense.deleteMany({ where: { id: { in: [createdRecurringExpenseId].filter(Boolean) } } }),
        prisma.project.deleteMany({ where: { id: createdProjectId || undefined, name: 'Realms Project Health smoke' } }),
        prisma.vendor.deleteMany({ where: { id: { in: [createdVendorId].filter(Boolean) } } }),
        prisma.client.deleteMany({ where: { id: { in: [createdClientId].filter(Boolean) } } }),
        prisma.activity.deleteMany({ where: { id: { in: createdActivityIds }, userId: createdUserId } }),
        prisma.lead.deleteMany({ where: { id: { in: createdLeadIds }, source: 'Staging smoke' } }),
        // The app shell auto-joins active employees to the company conversation.
        // ConvMember intentionally has no User FK, so remove the ephemeral row explicitly.
        prisma.convMember.deleteMany({ where: { userId: createdUserId } }),
        prisma.auditLog.deleteMany({ where: { userId: createdUserId } }),
        prisma.user.deleteMany({ where: { id: createdUserId, email } }),
      ]);
      // Receipt can legitimately be 0 when startup/auth fails before the canonical
      // action, or 1 after the action/replay path. The ephemeral user scope ensures
      // any larger count remains a cleanup-contract failure.
      if (tasks.count !== 3 || timeLogs.count !== 1 || attendance.count !== 1 || okrs.count !== 1 || reviews.count !== 1 || milestones.count !== 1 || phases.count !== 1
        || projects.count !== 1 || activities.count !== createdActivityIds.length || leads.count !== createdLeadIds.length
        || invoices.count !== (createdInvoiceId ? 1 : 0) || vendorBills.count !== (createdVendorBillId ? 1 : 0)
        || transactions.count !== createdTransactionIds.length || budgets.count !== (createdBudgetId ? 1 : 0)
        || recurringExpenses.count !== (createdRecurringExpenseId ? 1 : 0) || vendors.count !== (createdVendorId ? 1 : 0)
        || clients.count !== (createdClientId ? 1 : 0)
        || receipts.count > 1 || removed.count !== 1) {
        fail(`Ephemeral QA cleanup removed ${projects.count} projects, ${tasks.count} tasks, ${timeLogs.count} TimeLogs, ${attendance.count} Attendance, ${okrs.count} OKRs, ${reviews.count} Reviews, ${leads.count} Leads, ${activities.count} Activities, ${invoices.count} Invoices, ${vendorBills.count} VendorBills, ${transactions.count} Transactions, ${receipts.count} receipts and ${removed.count} accounts.`);
      } else console.log('Ephemeral QA Project, tasks, TimeLog, HR Evidence, CRM Leads/Activities, Finance records, receipt, revisions, events, account and audit cleanup passed.');
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[staging_execution_smoke_failed] ${error.message}`);
  process.exitCode = 1;
});
