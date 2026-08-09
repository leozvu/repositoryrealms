#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { totp } from '../lib/totp.js';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function required(name) {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('The portal URL must use HTTPS outside localhost.');
  }
  return url.origin;
}

function readCredential(file) {
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('Credential path is not a file.');
  const credential = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!credential.email || !credential.password || !credential.totpSecret) {
    throw new Error('Credential file must contain email, password and totpSecret.');
  }
  return credential;
}

function cookieMetadata(cookie) {
  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expires: cookie.expires,
  };
}

function resolveVercelProtectionBypass(portalOrigin) {
  const command = process.platform === 'win32'
    ? {
      executable: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `npx vercel@latest curl "${portalOrigin}/login" -v --silent`],
    }
    : {
      executable: 'npx',
      args: ['vercel@latest', 'curl', `${portalOrigin}/login`, '-v', '--silent'],
    };
  const result = spawnSync(command.executable, command.args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  const transcript = `${result.stdout || ''}\n${result.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, '');
  const match = transcript.match(/^> x-vercel-protection-bypass:\s*(.+)$/im);
  const value = match?.[1]?.trim();
  if (result.status !== 0 || !value) {
    throw new Error('Unable to obtain a Vercel Deployment Protection bypass from the authenticated CLI.');
  }
  return value;
}

async function main() {
  const portalOrigin = normalizeOrigin(required('portal-url'));
  const credential = readCredential(required('credential-file'));
  const entityId = String(required('entity')).trim().toLowerCase();
  const redirectPath = argument('redirect-path', '/dashboard');
  const entityBaseOrigin = argument('entity-base-url')
    ? normalizeOrigin(argument('entity-base-url'))
    : null;
  const timeout = Number(argument('timeout-ms', '45000'));
  const headless = argument('headed', '0') !== '1';
  const protectedOrigins = new Map();
  if (flag('vercel-protected')) {
    protectedOrigins.set(portalOrigin, resolveVercelProtectionBypass(portalOrigin));
  }
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  if (protectedOrigins.size > 0) {
    await context.route('**/*', async (route) => {
      const request = route.request();
      let requestOrigin = null;
      try {
        requestOrigin = new URL(request.url()).origin;
      } catch {
        requestOrigin = null;
      }
      const protectionBypass = protectedOrigins.get(requestOrigin);
      if (!protectionBypass) return route.continue();
      return route.continue({
        headers: {
          ...request.headers(),
          'x-vercel-protection-bypass': protectionBypass,
          'x-vercel-set-bypass-cookie': 'true',
        },
      });
    });
  }
  const page = await context.newPage();
  const callback = { seen: false, status: null, setCookieNames: [], location: null };

  page.on('response', async (response) => {
    if (!response.url().includes('/api/ceo/v1/sso/callback')) return;
    callback.seen = true;
    callback.status = response.status();
    const headers = await response.headersArray();
    callback.location = headers.find((header) => header.name.toLowerCase() === 'location')?.value || null;
    callback.setCookieNames = headers
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => String(header.value).split('=', 1)[0]);
  });

  try {
    await page.goto(`${portalOrigin}/login`, { waitUntil: 'networkidle', timeout });
    await page.locator('#login-email').fill(credential.email);
    await page.locator('#login-password').fill(credential.password);
    await page.locator('#login-otp').fill(totp(credential.totpSecret));
    await page.locator('.login-submit').click();
    await page.waitForURL((url) => url.origin === portalOrigin && url.pathname !== '/login', { timeout });

    const identityBootstrap = await page.evaluate(async ({ otp }) => {
      const response = await fetch('/api/ceo/v1/identity/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, deviceLabel: 'RepositoryRealms authenticated SSO smoke' }),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }, { otp: totp(credential.totpSecret) });
    if (identityBootstrap.status !== 200 || identityBootstrap.body?.session?.stepUp !== true) {
      throw new Error(`CEO identity bootstrap failed with HTTP ${identityBootstrap.status}: ${identityBootstrap.body?.code || 'unknown'}.`);
    }

    const portalChecks = await page.evaluate(async (checks) => Object.fromEntries(await Promise.all(checks.map(async ([key, url]) => {
      const response = await fetch(url, { cache: 'no-store' }).catch(() => null);
      const body = response ? await response.json().catch(() => ({})) : {};
      return [key, { status: response?.status || 0, ok: Boolean(response?.ok), code: body?.code || null }];
    }))), [
      ['dashboard', '/api/ceo/v1/dashboard'],
      ['decisions', '/api/ceo/v1/decision-queue'],
      ['messaging', '/api/ceo/v1/messaging/conversations'],
      ['commands', '/api/ceo/v1/command-gateway?limit=1'],
      ['workforce', '/api/ceo/v1/staff/links'],
      ['rollout', '/api/ceo/v1/rollout'],
      ['registry', '/api/ceo/v1/registry'],
      ['executive', '/api/ceo/v2/executive-workspace'],
    ]);

    const controlPlaneEvidence = await page.evaluate(async ({ requestedEntity }) => {
      const [executiveResponse, capabilityResponse] = await Promise.all([
        fetch('/api/ceo/v2/executive-workspace', { cache: 'no-store' }),
        fetch(`/api/ceo/v1/command-gateway/capabilities?entityId=${encodeURIComponent(requestedEntity)}`, { cache: 'no-store' }),
      ]);
      const executive = await executiveResponse.json().catch(() => ({}));
      const capabilities = await capabilityResponse.json().catch(() => ({}));
      return {
        executive: {
          status: executiveResponse.status,
          summary: executive?.summary || null,
          entities: Array.isArray(executive?.entities)
            ? executive.entities.map((row) => ({ id: row.id, status: row.status, errorCode: row.errorCode || null }))
            : [],
        },
        capabilities: {
          status: capabilityResponse.status,
          entityId: capabilities?.entityId || null,
          source: capabilities?.source || null,
          actions: Array.isArray(capabilities?.actions) ? capabilities.actions : [],
          code: capabilities?.code || null,
        },
      };
    }, { requestedEntity: entityId });

    const authorization = await page.evaluate(async ({ entityId: requestedEntity, redirectPath: requestedPath }) => {
      const response = await fetch('/api/ceo/v1/sso/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: requestedEntity, redirectPath: requestedPath }),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }, { entityId, redirectPath });

    if (authorization.status !== 200 || !authorization.body?.destination) {
      throw new Error(`SSO authorization failed with HTTP ${authorization.status}: ${authorization.body?.code || 'unknown'}.`);
    }

    const destination = new URL(authorization.body.destination);
    if (entityBaseOrigin) {
      const entityBase = new URL(entityBaseOrigin);
      destination.protocol = entityBase.protocol;
      destination.host = entityBase.host;
    }
    await page.goto(destination.toString(), { waitUntil: 'domcontentloaded', timeout });
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 5_000) }).catch(() => {});
    const entityOrigin = new URL(page.url()).origin;
    const sessionResponse = await context.request.get(`${entityOrigin}/api/auth/session`, {
      headers: { 'Cache-Control': 'no-store' },
      timeout,
    });
    const session = await sessionResponse.json().catch(() => ({}));
    const cookies = (await context.cookies(entityOrigin))
      .filter((cookie) => cookie.name.includes('next-auth.session-token'))
      .map(cookieMetadata);
    const sessionAuthenticated = Boolean(session?.user?.id && session?.user?.email);
    if (sessionAuthenticated && new URL(page.url()).pathname === '/login') {
      await page.goto(`${entityOrigin}/dashboard`, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 5_000) }).catch(() => {});
    }

    const report = {
      entityId,
      portalAuthenticated: true,
      identityBootstrapStatus: identityBootstrap.status,
      portalChecks,
      controlPlaneEvidence,
      authorizationStatus: authorization.status,
      callback,
      finalUrl: page.url(),
      sessionStatus: sessionResponse.status(),
      sessionAuthenticated,
      sessionRole: session?.user?.role || null,
      sessionRoles: Array.isArray(session?.user?.roles) ? session.user.roles : [],
      sessionAccessDisabled: session?.user?.accessDisabled ?? null,
      cookies,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    const enteredRequestedSurface = new URL(report.finalUrl).pathname === redirectPath;
    const executiveReady = report.controlPlaneEvidence.executive.status === 200
      && report.controlPlaneEvidence.executive.summary?.registered === 4
      && report.controlPlaneEvidence.executive.summary?.ready === 4
      && report.controlPlaneEvidence.executive.summary?.degraded === 0;
    const capabilitiesReady = report.controlPlaneEvidence.capabilities.status === 200
      && report.controlPlaneEvidence.capabilities.entityId === entityId
      && report.controlPlaneEvidence.capabilities.source === 'entity'
      && report.controlPlaneEvidence.capabilities.actions.length > 0;
    if (!report.sessionAuthenticated || !enteredRequestedSurface || !executiveReady || !capabilitiesReady) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
});
