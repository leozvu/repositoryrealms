import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { hashKey } from '../lib/apiauth.js';
import {
  CEO_SERVICE_SCOPE_ALLOWLIST,
  CEO_SERVICE_SCOPES,
  authenticateCeoServiceRequest,
} from '../lib/ceo-service-auth.js';
import { CEO_SECURITY_CHAOS_SCENARIOS, runCeoSecurityChaosSuite } from '../lib/ceo-security-chaos.js';
import { rotateLocalCeoServiceCredential } from '../lib/ceo-service-credential-admin.js';
import { hashCeoIdentitySecret } from '../lib/ceo-identity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-22T04:00:00.000Z');
const RAW_KEY = 'ak_ceo8_service_credential_for_tests_1234567890';
const RAW_SESSION = 'ceo8_portal_session_token_for_rotation_1234567890';
const HASH_SECRET = 'ceo8-test-hash-secret-with-at-least-32-bytes';
const DIRECTOR = { id: 'director-1', name: 'Vũ Lương Sơn', roles: ['DIRECTOR'] };

function request({ raw = RAW_KEY, audience = 'aim' } = {}) {
  const values = new Map([
    ['authorization', raw ? `Bearer ${raw}` : ''],
    ['x-ceo-entity-id', audience],
  ]);
  return { headers: { get: (name) => values.get(name.toLowerCase()) || null } };
}

function authFixture(overrides = {}) {
  let count = 0;
  const key = {
    id: 'service-key-1', name: 'CEO service', prefix: RAW_KEY.slice(0, 10), keyHash: hashKey(RAW_KEY),
    roles: '["DIRECTOR"]', scopes: JSON.stringify(CEO_SERVICE_SCOPE_ALLOWLIST), audience: 'aim',
    active: true, expiresAt: new Date(NOW.getTime() + 86_400_000), ...overrides,
  };
  return {
    db: {
      apiKey: {
        findUnique: async ({ where }) => where.keyHash === key.keyHash ? key : null,
        update: async () => key,
      },
      ceoApiRateLimitBucket: {
        upsert: async () => ({ requestCount: ++count }),
        deleteMany: async () => ({ count: 0 }),
      },
    },
    count: () => count,
  };
}

test('CEO-8 service auth enforces scope, audience, expiry and a durable per-entity rate limit', async () => {
  const fixture = authFixture();
  const first = await authenticateCeoServiceRequest(fixture.db, request(), CEO_SERVICE_SCOPES.SNAPSHOT_READ, { now: NOW, rateLimit: 2 });
  assert.equal(first.user.roles[0], 'DIRECTOR');
  assert.equal(first.credential.audience, 'aim');
  assert.equal(first.headers['X-RateLimit-Remaining'], '1');
  await authenticateCeoServiceRequest(fixture.db, request(), CEO_SERVICE_SCOPES.SNAPSHOT_READ, { now: NOW, rateLimit: 2 });
  await assert.rejects(
    authenticateCeoServiceRequest(fixture.db, request(), CEO_SERVICE_SCOPES.SNAPSHOT_READ, { now: NOW, rateLimit: 2 }),
    (error) => error.code === 'ceo_service_rate_limited' && error.status === 429 && Boolean(error.headers['Retry-After']),
  );
  const wrongAudience = authFixture();
  await assert.rejects(
    authenticateCeoServiceRequest(wrongAudience.db, request({ audience: 'egoric' }), CEO_SERVICE_SCOPES.SNAPSHOT_READ, { now: NOW }),
    (error) => error.code === 'ceo_service_audience_mismatch',
  );
  const wrongTarget = authFixture();
  await assert.rejects(
    authenticateCeoServiceRequest(wrongTarget.db, request(), CEO_SERVICE_SCOPES.SNAPSHOT_READ, { now: NOW, expectedAudience: 'egoric' }),
    (error) => error.code === 'ceo_service_target_audience_mismatch',
  );
  const missingScope = authFixture({ scopes: JSON.stringify([CEO_SERVICE_SCOPES.HEALTH_READ]) });
  await assert.rejects(
    authenticateCeoServiceRequest(missingScope.db, request(), CEO_SERVICE_SCOPES.SNAPSHOT_READ, { now: NOW }),
    (error) => error.code === 'ceo_service_scope_required',
  );
  const expired = authFixture({ expiresAt: new Date(NOW.getTime() - 1) });
  await assert.rejects(
    authenticateCeoServiceRequest(expired.db, request(), CEO_SERVICE_SCOPES.SNAPSHOT_READ, { now: NOW }),
    (error) => error.code === 'ceo_service_credential_expired',
  );
});

test('CEO-8 chaos rehearsal covers all seven failures without external or business mutations', () => {
  const suite = runCeoSecurityChaosSuite({ now: NOW });
  assert.equal(suite.passed, true);
  assert.equal(suite.mode, 'dry-run');
  assert.deepEqual(suite.results.map((item) => item.scenario), CEO_SECURITY_CHAOS_SCENARIOS);
  for (const result of suite.results) {
    assert.equal(result.invariants.businessMutationAttempted, false);
    assert.equal(result.invariants.externalRequestAttempted, false);
    assert.equal(result.invariants.localErpLoginPreserved, true);
    assert.ok(result.checks.every((check) => check.passed));
  }
});

test('CEO-8 credential rotation revokes the previous entity key and persists only a hash', async () => {
  const identity = { id: 'identity-1', userId: DIRECTOR.id, status: 'active' };
  const session = {
    id: 'session-1', identityId: identity.id, identity,
    tokenHash: hashCeoIdentitySecret(RAW_SESSION, HASH_SECRET),
    revokedAt: null, stepUpAt: NOW, lastSeenAt: NOW,
    idleExpiresAt: new Date(NOW.getTime() + 30 * 60_000), expiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000),
  };
  const keys = [{ id: 'old-key', audience: 'aim', active: true, scopes: JSON.stringify(CEO_SERVICE_SCOPE_ALLOWLIST) }];
  const audits = [];
  const tx = {
    ceoPortalSession: { findUnique: async ({ where }) => where.tokenHash === session.tokenHash ? session : null },
    apiKey: {
      updateMany: async ({ where, data }) => {
        const rows = keys.filter((key) => key.audience === where.audience && key.active === where.active);
        for (const key of rows) Object.assign(key, data);
        return { count: rows.length };
      },
      create: async ({ data }) => { const row = { id: 'new-key', createdAt: NOW, lastUsed: null, ...data }; keys.push(row); return row; },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const db = { ...tx, $transaction: async (operation) => operation(tx) };
  const result = await rotateLocalCeoServiceCredential(db, DIRECTOR, RAW_SESSION, 'aim', { ttlDays: 30 }, { now: NOW, hashSecret: HASH_SECRET });
  assert.equal(keys[0].active, false);
  assert.equal(keys[1].active, true);
  assert.equal(keys[1].audience, 'aim');
  assert.deepEqual(JSON.parse(keys[1].scopes), CEO_SERVICE_SCOPE_ALLOWLIST);
  assert.equal(keys[1].keyHash, hashKey(result.credential.key));
  assert.equal(JSON.stringify(keys).includes(result.credential.key), false);
  assert.equal(JSON.stringify(audits).includes(result.credential.key), false);
  assert.match(audits[0].detail, /audience=aim; prefix=/);
});

test('CEO-8 wiring prevents scoped keys from entering generic ERP APIs and separates SSO from service secrets', () => {
  const genericAuth = fs.readFileSync(path.join(root, 'lib/apiauth.js'), 'utf8');
  const registry = fs.readFileSync(path.join(root, 'lib/ceo-entity-registry-admin.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260722040000_add_ceo_security_controls/migration.sql'), 'utf8');
  const securityPage = fs.readFileSync(path.join(root, 'app/(app)/ceo-security/page.jsx'), 'utf8');
  assert.match(genericAuth, /parseScopes\(key\.scopes\)\.length \|\| key\.audience/);
  assert.match(registry, /row\.serviceCredentialRef \|\| row\.credentialRef/);
  assert.match(migration, /CeoApiRateLimitBucket/);
  assert.match(migration, /CEO_ENTITY_AIM_SERVICE_KEY/);
  assert.doesNotMatch(migration, /ak_[a-zA-Z0-9]{12,}/);
  assert.match(securityPage, /SUSPEND CEO PORTAL/);
  assert.match(securityPage, /api\/ceo\/v1\/security\/rehearsal/);
});

test('every target CEO endpoint declares its exact service scope', () => {
  const routes = {
    capabilities: 'CAPABILITIES_READ', health: 'HEALTH_READ', snapshot: 'SNAPSHOT_READ',
    commands: 'COMMAND_DISPATCH', 'commands/receipts': 'COMMAND_RECEIPTS_READ', directory: 'DIRECTORY_READ',
    'messaging/deliver': 'MESSAGE_DELIVER', 'messaging/receipts': 'MESSAGE_RECEIPTS_READ',
    'messaging/feed': 'MESSAGE_FEED_READ', 'federation/presence': 'FEDERATION_READ',
  };
  for (const [route, scope] of Object.entries(routes)) {
    const source = fs.readFileSync(path.join(root, `app/api/ceo/v1/${route}/route.js`), 'utf8');
    assert.match(source, new RegExp(`ceoServiceGuard\\(.*CEO_SERVICE_SCOPES\\.${scope}`), `${route} must use ${scope}`);
  }
});
