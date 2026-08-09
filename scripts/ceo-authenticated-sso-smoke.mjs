#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
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

async function main() {
  const portalOrigin = normalizeOrigin(required('portal-url'));
  const credential = readCredential(required('credential-file'));
  const entityId = String(required('entity')).trim().toLowerCase();
  const timeout = Number(argument('timeout-ms', '45000'));
  const headless = argument('headed', '0') !== '1';
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
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
    ]);

    const authorization = await page.evaluate(async ({ entityId: requestedEntity }) => {
      const response = await fetch('/api/ceo/v1/sso/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: requestedEntity, redirectPath: '/dashboard' }),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }, { entityId });

    if (authorization.status !== 200 || !authorization.body?.destination) {
      throw new Error(`SSO authorization failed with HTTP ${authorization.status}: ${authorization.body?.code || 'unknown'}.`);
    }

    await page.goto(authorization.body.destination, { waitUntil: 'domcontentloaded', timeout });
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

    const report = {
      entityId,
      portalAuthenticated: true,
      identityBootstrapStatus: identityBootstrap.status,
      portalChecks,
      authorizationStatus: authorization.status,
      callback,
      finalUrl: page.url(),
      sessionStatus: sessionResponse.status(),
      sessionAuthenticated: Boolean(session?.user?.id && session?.user?.email),
      sessionRole: session?.user?.role || null,
      sessionRoles: Array.isArray(session?.user?.roles) ? session.user.roles : [],
      sessionAccessDisabled: session?.user?.accessDisabled ?? null,
      cookies,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.sessionAuthenticated) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
});
