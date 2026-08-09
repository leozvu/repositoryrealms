import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runtimeDatabaseUrl } from '../lib/database-runtime.js';
import { buildCeoExecutiveSnapshot } from '../lib/ceo-executive-contract.js';
import { loadCeoExecutiveWorkspace } from '../lib/ceo-executive-workspace-admin.js';
import { hashCeoIdentitySecret } from '../lib/ceo-identity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-08-09T12:00:00.000Z');
const RAW_SESSION = 'ceo_chaos_session_token_1234567890';
const HASH_SECRET = 'ceo-chaos-hash-secret-at-least-32-characters';
const USER = { id: 'director-1', name: 'Vũ Lương Sơn', roles: ['DIRECTOR'] };

test('CEO-18 Vercel runtime constrains Prisma pools without losing schema, SSL or provider parameters', () => {
  const value = runtimeDatabaseUrl(
    'postgresql://db.example.test/app?schema=egoric&sslmode=require&pgbouncer=true&connection_limit=20',
    { VERCEL: '1' },
  );
  const url = new URL(value);
  assert.equal(url.searchParams.get('connection_limit'), '1');
  assert.equal(url.searchParams.get('pool_timeout'), '15');
  assert.equal(url.searchParams.get('schema'), 'egoric');
  assert.equal(url.searchParams.get('sslmode'), 'require');
  assert.equal(url.searchParams.get('pgbouncer'), 'true');
});

function workspaceFixture() {
  const entities = [
    { id: 'aim', displayName: 'AIm', baseUrl: 'https://aim.test', enabled: true, environment: 'production', credentialRef: 'CEO_ENTITY_AIM_API_KEY', serviceCredentialRef: 'CEO_ENTITY_AIM_SERVICE_KEY', circuitState: 'closed', status: 'ready', consecutiveErrors: 0 },
    { id: 'egoric', displayName: 'Egoric', baseUrl: 'https://egoric.test', enabled: true, environment: 'production', credentialRef: 'CEO_ENTITY_EGORIC_API_KEY', serviceCredentialRef: 'CEO_ENTITY_EGORIC_SERVICE_KEY', circuitState: 'closed', status: 'ready', consecutiveErrors: 0 },
    { id: 'vnecom', displayName: 'Vnecom', baseUrl: 'https://vnecom.test', enabled: true, environment: 'production', credentialRef: 'CEO_ENTITY_VNECOM_API_KEY', serviceCredentialRef: 'CEO_ENTITY_VNECOM_SERVICE_KEY', circuitState: 'closed', status: 'ready', consecutiveErrors: 0 },
  ];
  const identity = { id: 'identity-1', userId: USER.id, subject: 'ceo_subject', status: 'active' };
  const session = {
    id: 'session-1', identityId: identity.id, identity,
    tokenHash: hashCeoIdentitySecret(RAW_SESSION, HASH_SECRET), revokedAt: null,
    stepUpAt: NOW, lastSeenAt: NOW,
    idleExpiresAt: new Date(NOW.getTime() + 30 * 60_000), expiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000),
  };
  const db = {
    ceoPortalSession: { findUnique: async () => session },
    ceoEntityRegistry: {
      findMany: async () => entities,
      findUnique: async ({ where }) => entities.find((row) => row.id === where.id) || null,
      update: async ({ where, data }) => Object.assign(entities.find((row) => row.id === where.id), data),
      updateMany: async ({ where, data }) => { const row = entities.find((item) => item.id === where.id); if (row) Object.assign(row, data); return { count: row ? 1 : 0 }; },
    },
    ceoEntityMembership: {
      findMany: async () => entities.map((row) => ({ entityId: row.id })),
    },
    ceoRolloutState: { findUnique: async ({ where }) => ({ entityId: where.entityId, currentRing: 'commands', status: 'active', recordVersion: 3 }) },
    $transaction: async (callback) => callback(db),
  };
  return { db, entities };
}

test('CEO-18 executive workspace isolates unsupported and timed-out entities while preserving a healthy company', async () => {
  const fixture = workspaceFixture();
  const aimSnapshot = buildCeoExecutiveSnapshot({
    identity: { id: 'aim' }, settings: { currency: 'VND' }, capabilities: { crm: false, support: false, livestream: false },
    records: { activeHeadcount: 2 }, asOf: NOW,
  });
  const fetchImpl = async (url) => {
    if (url.hostname === 'vnecom.test') { const error = new Error('timeout'); error.name = 'AbortError'; throw error; }
    if (url.pathname.endsWith('/capabilities')) {
      return new Response(JSON.stringify({
        entityId: url.hostname.split('.')[0],
        endpoints: url.hostname === 'aim.test' ? { executiveSnapshot: '/api/ceo/v2/executive-snapshot' } : {},
      }), { status: 200 });
    }
    return new Response(JSON.stringify(aimSnapshot), { status: 200 });
  };
  const result = await loadCeoExecutiveWorkspace(fixture.db, USER, RAW_SESSION, {}, {
    now: NOW, hashSecret: HASH_SECRET, fetchImpl,
    secretResolver: () => 'scoped-service-key',
    allowedOriginResolver: (entity) => [entity.baseUrl], timeoutMs: 20,
  });
  assert.equal(result.summary.ready, 1);
  assert.equal(result.summary.notSupported, 1);
  assert.equal(result.summary.degraded, 1);
  assert.equal(result.entities.find((row) => row.id === 'aim').snapshot.sections.capacity.activeHeadcount, 2);
  assert.equal(result.entities.find((row) => row.id === 'egoric').status, 'not_supported');
  assert.equal(result.entities.find((row) => row.id === 'vnecom').errorCode, 'ceo_executive_upstream_timeout');
  assert.equal(result.invariants.currenciesCombined, false);
  assert.equal(result.invariants.directEntityWrites, false);
});

test('CEO-18 UI fails soft to the stable command set when capability negotiation is unavailable', () => {
  const page = fs.readFileSync(path.join(root, 'app/(app)/ceo-commands/page.jsx'), 'utf8');
  assert.match(page, /LEGACY_ACTIONS/);
  assert.match(page, /capabilitiesFallback/);
  assert.match(page, /setCapabilitiesState\('fallback'\)/);
  assert.doesNotMatch(page, /payroll\.write|invoice\.approve|payout\.settle/);
});
