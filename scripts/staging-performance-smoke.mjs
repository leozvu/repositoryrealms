import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = String(process.env.REALMS_STAGING_PREVIEW_URL || '').replace(/\/$/, '');
const email = String(process.env.REALMS_STAGING_PERF_EMAIL || 'am@agency.vn').trim().toLowerCase();
const password = String(process.env.REALMS_STAGING_DEMO_PASSWORD || '');
const thresholdMs = Math.max(500, Number(process.env.REALMS_STAGING_PERF_P95_MS || 5_000));
const routes = ['/api/realm-demo/health', '/api/realm-demo/pilot', '/api/execution/my-work', '/api/collaboration/presence'];

function fail(message) { throw new Error(message); }

function safety() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  if (branch !== 'codex/realms-demo') fail(`Refusing performance smoke from branch ${branch || '(detached)'}.`);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
  if (project.projectName !== 'crmegoric-realms-demo') fail(`Refusing Vercel project ${project.projectName || '(unknown)'}.`);
  if (!/^https:\/\/crmegoric-realms-demo-[a-z0-9-]+\.vercel\.app$/i.test(baseUrl)) fail('Preview URL is not a crmegoric-realms-demo deployment.');
  if (password.length < 16) fail('A staging-only demo password is required.');
  const target = assertFullStagingTarget({
    environment: process.env.REALMS_DEPLOY_ENV,
    databaseUrl: process.env.REALMS_STAGING_DATABASE_URL,
    protectedDatabaseUrls: [process.env.PROTECTED_PRODUCTION_DATABASE_URL, process.env.PROTECTED_PRODUCTION_DIRECT_URL],
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1',
  });
  if (process.env.REALMS_STAGING_APPROVAL !== target.approval) fail('Staging approval mismatch.');
}

function percentile(values, value) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
}

async function main() {
  safety();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const csrfResponse = await context.request.get(`${baseUrl}/api/auth/csrf`, { timeout: 10_000 });
    const csrf = await csrfResponse.json();
    const callback = await context.request.post(`${baseUrl}/api/auth/callback/credentials`, {
      form: { csrfToken: csrf.csrfToken, email, password, otp: '', callbackUrl: `${baseUrl}/dashboard`, json: 'true' },
      headers: { 'X-Auth-Return-Redirect': '1' },
      timeout: 20_000,
    });
    if (callback.status() !== 200) fail(`Authentication failed (${callback.status()}).`);
    const cookies = await context.cookies(baseUrl);
    const sessionCookie = cookies.find((cookie) => cookie.name.includes('next-auth.session-token'));
    if (!sessionCookie?.httpOnly || !sessionCookie.secure || sessionCookie.sameSite !== 'Lax') fail('Session cookie security flags are incomplete.');

    for (const route of routes) {
      const warmup = await context.request.get(`${baseUrl}${route}`, { timeout: 20_000 });
      if (warmup.status() !== 200) fail(`Warmup failed for ${route} (${warmup.status()}).`);
    }

    const samples = [];
    const statuses = [];
    for (let batch = 0; batch < 8; batch += 1) {
      const results = await Promise.all(routes.map(async (route) => {
        const started = performance.now();
        const response = await context.request.get(`${baseUrl}${route}`, { timeout: 20_000 });
        return { route, status: response.status(), durationMs: performance.now() - started };
      }));
      for (const result of results) {
        samples.push(result.durationMs);
        statuses.push(result);
      }
    }
    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    const failures = statuses.filter((sample) => sample.status !== 200);
    if (failures.length) fail(`${failures.length}/${statuses.length} read requests failed.`);
    if (p95 > thresholdMs) fail(`Authenticated read p95 ${p95.toFixed(1)}ms exceeds ${thresholdMs}ms.`);
    const login = await context.request.get(`${baseUrl}/login`, { timeout: 10_000 });
    if (!login.headers()['content-security-policy']) fail('Content-Security-Policy header is missing.');
    console.log(`Phase 25 performance/security smoke passed: ${statuses.length} authenticated reads, p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms (limit ${thresholdMs}ms), 0 errors.`);
    console.log('Session cookie HttpOnly/Secure/SameSite=Lax and CSP header verified.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[phase25-performance] ${error.message}`);
  process.exitCode = 1;
});
