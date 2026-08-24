import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PHASE_0_AREAS, PHASE_0_BREAKPOINTS } from '../qa/realm-v2-visual-baseline/phase-0-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'qa', 'realm-v2-visual-baseline', 'current');
const manifestPath = path.join(root, 'qa', 'realm-v2-visual-baseline', 'baseline-manifest.json');
const baseUrl = String(process.env.REALM_V2_BASELINE_URL || '').trim().replace(/\/$/, '');
const email = String(process.env.REALM_V2_BASELINE_EMAIL || '').trim().toLowerCase();
const password = String(process.env.REALM_V2_BASELINE_PASSWORD || '');
const expectedBranch = String(process.env.REALM_V2_BASELINE_BRANCH || 'codex/realm-design-system-v2-implementation');

function fail(message) {
  throw new Error(message);
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function safety() {
  const branchResult = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false });
  const branch = branchResult.stdout.trim();
  if (branchResult.status !== 0 || branch !== expectedBranch) {
    fail(`Refusing visual capture from branch ${branch || '(detached)'}; expected ${expectedBranch}.`);
  }
  if (!baseUrl || !email || !password) {
    fail('REALM_V2_BASELINE_URL, REALM_V2_BASELINE_EMAIL and REALM_V2_BASELINE_PASSWORD are required.');
  }
  const target = new URL(baseUrl);
  const local = ['127.0.0.1', 'localhost'].includes(target.hostname);
  const preview = /^crmegoric-realms-demo(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(target.hostname);
  if ((!local && !preview) || (local ? target.protocol !== 'http:' : target.protocol !== 'https:')) {
    fail('Baseline target must be localhost or a crmegoric-realms-demo Vercel URL.');
  }
}

async function authenticate(context) {
  const csrfResponse = await context.request.get(`${baseUrl}/api/auth/csrf`, { timeout: 15_000 });
  const csrf = await csrfResponse.json().catch(() => ({}));
  if (csrfResponse.status() !== 200 || !csrf?.csrfToken) fail('Unable to bootstrap the preview CSRF token.');
  const callback = await context.request.post(`${baseUrl}/api/auth/callback/credentials`, {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password,
      otp: '',
      callbackUrl: `${baseUrl}/dashboard`,
      json: 'true',
    },
    headers: { 'X-Auth-Return-Redirect': '1' },
    timeout: 20_000,
  });
  if (callback.status() !== 200) fail(`Preview authentication failed (${callback.status()}).`);
  const session = await context.request.get(`${baseUrl}/api/auth/session`, {
    headers: { 'Cache-Control': 'no-store' },
    timeout: 15_000,
  });
  const body = await session.json().catch(() => ({}));
  if (session.status() !== 200 || !body?.user?.id) fail('Preview session was not established.');
  return { role: body.user.role || 'unknown' };
}

async function main() {
  safety();
  fs.mkdirSync(outputDirectory, { recursive: true });
  const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  const browser = await chromium.launch({ headless: true });
  const screenshots = [];
  const capturedAt = new Date().toISOString();
  try {
    const context = await browser.newContext({
      colorScheme: 'dark',
      locale: 'vi-VN',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const identity = await authenticate(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    let transientOnboardingDismissed = false;
    const onboardingSkip = page.getByRole('button', { name: /Bỏ qua lúc này|Skip for now/i });
    if (await onboardingSkip.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) {
      await onboardingSkip.click();
      await onboardingSkip.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
      transientOnboardingDismissed = true;
    }
    const pageErrors = [];
    const consoleErrors = [];
    const serverErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()}:${new URL(response.url()).pathname}`);
    });

    for (const breakpoint of PHASE_0_BREAKPOINTS) {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
      for (const area of PHASE_0_AREAS) {
        const issueOffsets = { page: pageErrors.length, console: consoleErrors.length, server: serverErrors.length };
        const aliasPath = `/realm-v2/${area.slug}`;
        const response = await page.goto(`${baseUrl}${aliasPath}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        // The authenticated shell keeps background polling/realtime transports alive,
        // so networkidle is only a short best-effort stabilization signal.
        await page.waitForLoadState('networkidle', { timeout: 750 }).catch(() => {});
        await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important}' });
        await page.waitForTimeout(150);
        const runtime = await page.evaluate(() => ({
          finalPath: `${window.location.pathname}${window.location.search}`,
          documentLanguage: document.documentElement.lang || '',
          horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          visualUpgrade: document.querySelector('[data-visual-upgrade]')?.getAttribute('data-visual-upgrade') || null,
          hasFiveItemMobileNav: document.querySelectorAll('nav[aria-label*="Mobile"] a, nav[aria-label*="mobile"] a').length === 5,
        }));
        if (new URL(page.url()).pathname !== area.canonicalPath) {
          fail(`${aliasPath} resolved to ${new URL(page.url()).pathname}; expected ${area.canonicalPath}.`);
        }
        const fileName = `${String(PHASE_0_AREAS.indexOf(area) + 1).padStart(2, '0')}-${area.slug}--${breakpoint.id}.png`;
        const absoluteFile = path.join(outputDirectory, fileName);
        await page.screenshot({ path: absoluteFile, type: 'png', fullPage: false, animations: 'disabled' });
        const relativeFile = path.relative(root, absoluteFile).replaceAll('\\', '/');
        screenshots.push({
          area: area.slug,
          productArea: area.productArea,
          breakpoint: breakpoint.id,
          viewport: { width: breakpoint.width, height: breakpoint.height },
          aliasPath,
          canonicalPath: area.canonicalPath,
          finalPath: runtime.finalPath,
          documentLanguage: runtime.documentLanguage,
          horizontalOverflowPx: runtime.horizontalOverflowPx,
          visualUpgrade: runtime.visualUpgrade,
          hasFiveItemMobileNav: runtime.hasFiveItemMobileNav,
          navigationStatus: response?.status() || null,
          runtimeIssues: {
            pageErrors: pageErrors.slice(issueOffsets.page),
            consoleErrors: consoleErrors.slice(issueOffsets.console),
            serverErrors: serverErrors.slice(issueOffsets.server),
          },
          file: relativeFile,
          bytes: fs.statSync(absoluteFile).size,
          sha256: sha256(absoluteFile),
        });
        process.stdout.write(`Captured ${screenshots.length}/${PHASE_0_AREAS.length * PHASE_0_BREAKPOINTS.length}: ${area.slug} @ ${breakpoint.width}px\n`);
      }
    }
    const manifest = {
      version: 1,
      status: 'Design complete / implementation partial',
      captureMode: 'authenticated-current-implementation',
      baseUrl,
      sourceCommit,
      capturedAt,
      authenticatedRole: identity.role,
      transientOnboardingDismissed,
      areaCount: PHASE_0_AREAS.length,
      breakpointCount: PHASE_0_BREAKPOINTS.length,
      screenshotCount: screenshots.length,
      screenshots,
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`Realm v2 baseline captured: ${screenshots.length} screenshots, manifest ${path.relative(root, manifestPath)}.\n`);
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[realm-v2-baseline] ${error.message}`);
  process.exitCode = 1;
});
