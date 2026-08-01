import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEPLOYMENT_KINDS,
  ceoPortalOrigin,
  deploymentBranding,
  deploymentKind,
  isCeoPortalOnlyPath,
} from '../lib/deployment-profile.js';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('CEO-11 classifies deployments server-side and defaults unknown production to entity', () => {
  assert.equal(deploymentKind({ REPOSITORYREALMS_DEPLOYMENT_KIND: 'ceo-portal', NODE_ENV: 'production' }), DEPLOYMENT_KINDS.CEO_PORTAL);
  assert.equal(deploymentKind({ APP_DEPLOYMENT_KIND: 'entity', NODE_ENV: 'production', NEXT_PUBLIC_CEO_GROUP_WORKFORCE: '1' }), DEPLOYMENT_KINDS.ENTITY);
  assert.equal(deploymentKind({ VERCEL_PROJECT_PRODUCTION_URL: 'ceo-terminal-leoz.vercel.app', NODE_ENV: 'production' }), DEPLOYMENT_KINDS.CEO_PORTAL);
  assert.equal(deploymentKind({ CEO_PORTAL_ORIGIN: 'https://ceo-terminal-leoz.vercel.app', NODE_ENV: 'production' }), DEPLOYMENT_KINDS.ENTITY);
  assert.equal(deploymentKind({ VERCEL_PROJECT_PRODUCTION_URL: 'erp-egoric.vercel.app', NODE_ENV: 'production' }), DEPLOYMENT_KINDS.ENTITY);
});

test('CEO-11 exposes control-plane paths only on the CEO deployment', () => {
  for (const path of [
    '/ceo-overview', '/ceo-world', '/ceo-commands', '/ceo-workforce', '/ceo-inbox', '/ceo-registry', '/ceo-security', '/ceo-rollout',
    '/realm-v2/command-center', '/realm-v2/world-map', '/realm-v2/ceo-terminal',
    '/api/ceo/v1/dashboard', '/api/ceo/v1/registry/aim', '/api/ceo/v1/identity/session', '/api/ceo/v1/staff/sso',
  ]) assert.equal(isCeoPortalOnlyPath(path), true, path);

  // Entity-side contract endpoints must stay reachable for federation and receipts.
  for (const path of [
    '/api/ceo/v1/capabilities', '/api/ceo/v1/health', '/api/ceo/v1/snapshot', '/api/ceo/v1/commands',
    '/api/ceo/v1/commands/receipts', '/api/ceo/v1/directory/profile', '/api/ceo/v1/federation/presence',
    '/api/ceo/v1/messaging/deliver', '/api/ceo/v1/messaging/feed', '/api/ceo/v1/sso/callback',
  ]) assert.equal(isCeoPortalOnlyPath(path), false, path);

  const middleware = text('middleware.js');
  assert.match(middleware, /isCeoPortalOnlyPath/);
  assert.match(middleware, /status:\s*404/);
  assert.match(middleware, /noindex, nofollow/);
});

test('CEO-11 gives the portal a dedicated login, shell and v2 presentation', () => {
  const portal = deploymentBranding({ REPOSITORYREALMS_DEPLOYMENT_KIND: 'ceo-portal', NODE_ENV: 'production' });
  assert.equal(portal.homePath, '/ceo-overview');
  assert.equal(portal.product, 'CEO Terminal');
  assert.equal(ceoPortalOrigin({ CEO_PORTAL_ORIGIN: 'https://portal.example/path' }), 'https://portal.example');

  const appLayout = text('app/(app)/layout.jsx');
  const shell = text('components/Shell.jsx');
  const login = text('app/login/LoginForm.jsx');
  assert.match(appLayout, /const v2Enabled = ceoPortal \|\| realmV2PreviewEnabled\(\)/);
  assert.match(appLayout, /ceoPortal=\{ceoPortal\}/);
  assert.match(shell, /CEO Terminal · 4 công ty/);
  assert.match(shell, /!ceoPortal && <WorkspaceSurfaceSwitch/);
  assert.match(login, /LEOZ GROUP · CONTROL PLANE/);
  assert.match(login, /ceoPortal \? '\/ceo-overview' : '\/dashboard'/);
  assert.match(login, /ceoPortal && <button[^>]+login-recovery-toggle/);
});

test('all CEO navigation entries are portal-only while entity ERP keeps a safe portal link', () => {
  const navigation = text('lib/erp-navigation.js');
  const entries = [...navigation.matchAll(/\{ key: '(ceo-[^']+)'[^\n]+\}/g)];
  assert.equal(entries.length, 8);
  for (const entry of entries) assert.match(entry[0], /ceoPortalOnly:\s*true/, entry[1]);
  assert.match(text('components/Shell.jsx'), /Mở CEO Terminal/);
});
