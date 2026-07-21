import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CEO_ENTITY_REGISTRY_SEED,
  ceoCircuitAvailability,
  normalizeCeoCredentialRef,
  normalizeCeoRegistryBaseUrl,
  normalizeCeoRegistryUpdate,
  parseCeoRegistryCapabilities,
  planCeoRegistryFailure,
  serializeCeoRegistryEntity,
} from '../lib/ceo-entity-registry.js';
import {
  listCeoRegistryEntities,
  prepareCeoRegistrySync,
  recordCeoRegistrySyncFailure,
  recordCeoRegistrySyncSuccess,
  rotateCeoRegistryCredential,
  updateCeoRegistryEntity,
} from '../lib/ceo-entity-registry-admin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-21T19:00:00.000Z');
const DIRECTOR = { id: 'director-1', name: 'Vũ Lương Sơn', roles: ['DIRECTOR'] };
const STAFF = { id: 'staff-1', name: 'Staff', roles: ['STAFF'] };
const RAW_KEY = 'ak_private_value_that_must_never_be_serialized';

function entity(overrides = {}) {
  return {
    id: 'aim', displayName: 'AIm Agency', baseUrl: 'https://agency-erp-mu.vercel.app',
    businessProfile: 'agency', capabilities: '["finance","crm","people"]', environment: 'production',
    enabled: false, status: 'disabled', credentialRef: 'CEO_ENTITY_AIM_API_KEY', credentialVersion: 1,
    contractVersion: '1.0.0', schemaVersion: 1, recordVersion: 1,
    lastSyncAttemptAt: null, lastSuccessfulSyncAt: null, consecutiveErrors: 0, lastErrorCode: null,
    circuitState: 'closed', circuitOpenedAt: null, circuitRetryAt: null, rotatedAt: null,
    createdAt: NOW, updatedAt: NOW,
    ...overrides,
  };
}

function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && Object.hasOwn(value, 'increment')) row[key] += value.increment;
    else row[key] = value;
  }
}

function database(initial = entity()) {
  let state = { ...initial };
  const audits = [];
  const tx = {
    ceoEntityRegistry: {
      findMany: async () => [{ ...state }],
      findUnique: async ({ where }) => where.id === state.id ? { ...state } : null,
      updateMany: async ({ where, data }) => {
        const matches = where.id === state.id
          && (where.recordVersion === undefined || where.recordVersion === state.recordVersion)
          && (where.consecutiveErrors === undefined || where.consecutiveErrors === state.consecutiveErrors);
        if (!matches) return { count: 0 };
        applyData(state, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        if (where.id !== state.id) throw new Error('not found');
        applyData(state, data);
        return { ...state };
      },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  return {
    db: { ...tx, $transaction: async (operation) => operation(tx) },
    audits,
    state: () => ({ ...state }),
  };
}

test('CEO-2 seeds exactly four stable entities with server-secret references only', () => {
  assert.deepEqual(CEO_ENTITY_REGISTRY_SEED.map((item) => item.id), ['aim', 'egoric', 'vnecom', 'egolive']);
  for (const item of CEO_ENTITY_REGISTRY_SEED) {
    assert.equal(item.baseUrl.startsWith('https://'), true);
    assert.match(item.credentialRef, /^CEO_ENTITY_[A-Z0-9_]+_API_KEY$/);
    assert.equal(JSON.stringify(item).includes('ak_'), false);
    assert.equal(item.capabilities.includes('finance'), true);
  }
  assert.equal(CEO_ENTITY_REGISTRY_SEED.find((item) => item.id === 'egolive').capabilities.includes('livestream'), true);
});

test('Registry validation rejects raw keys, unsafe URLs, unknown fields and unknown capabilities', () => {
  assert.equal(normalizeCeoCredentialRef('CEO_ENTITY_AIM_V2_API_KEY'), 'CEO_ENTITY_AIM_V2_API_KEY');
  assert.equal(normalizeCeoRegistryBaseUrl('https://erp-egoric.vercel.app'), 'https://erp-egoric.vercel.app');
  assert.throws(() => normalizeCeoCredentialRef(RAW_KEY), (error) => error.code === 'ceo_registry_credential_ref_invalid');
  assert.throws(() => normalizeCeoRegistryBaseUrl('http://127.0.0.1:3300'), (error) => error.code === 'ceo_registry_base_url_invalid');
  assert.throws(() => normalizeCeoRegistryBaseUrl('https://erp-egoric.vercel.app/api'), (error) => error.code === 'ceo_registry_base_url_invalid');
  assert.throws(() => normalizeCeoRegistryUpdate({ expectedVersion: 1, credentialRef: RAW_KEY, enabled: true }), (error) => error.code === 'ceo_registry_update_field_unsupported');
  assert.throws(() => normalizeCeoRegistryUpdate({ expectedVersion: 1, capabilities: ['finance', 'salary'] }), (error) => error.code === 'ceo_registry_capability_unknown');
  assert.deepEqual(parseCeoRegistryCapabilities('{broken'), []);
});

test('Registry read is Director-only and never serializes the credential reference or raw secret', async () => {
  const fixture = database();
  await assert.rejects(() => listCeoRegistryEntities(fixture.db, STAFF), (error) => error.code === 'ceo_registry_director_required');
  const result = await listCeoRegistryEntities(fixture.db, DIRECTOR, { secretResolver: () => RAW_KEY });
  assert.equal(result.entities[0].credential.configured, true);
  assert.deepEqual(result.destructiveCommands, []);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('credentialRef'), false);
  assert.equal(serialized.includes('CEO_ENTITY_AIM_API_KEY'), false);
  assert.equal(serialized.includes(RAW_KEY), false);
  assert.equal(serializeCeoRegistryEntity(entity(), { secretResolver: () => '' }).credential.configured, false);
});

test('Enablement fails closed without a provisioned secret and uses CAS plus AuditLog', async () => {
  const fixture = database();
  await assert.rejects(
    () => updateCeoRegistryEntity(fixture.db, DIRECTOR, 'aim', { expectedVersion: 1, enabled: true }, { secretResolver: () => '' }),
    (error) => error.code === 'ceo_registry_credential_missing' && error.status === 422,
  );
  const updated = await updateCeoRegistryEntity(
    fixture.db,
    DIRECTOR,
    'aim',
    { expectedVersion: 1, enabled: true, capabilities: ['people', 'finance', 'crm'] },
    { secretResolver: () => RAW_KEY },
  );
  assert.equal(updated.enabled, true);
  assert.equal(updated.status, 'unverified');
  assert.equal(updated.recordVersion, 2);
  assert.deepEqual(updated.capabilities, ['finance', 'crm', 'people']);
  assert.equal(fixture.audits[0].action, 'ceo_registry_update');
  assert.equal(fixture.audits[0].detail.includes(RAW_KEY), false);
  await assert.rejects(
    () => updateCeoRegistryEntity(fixture.db, DIRECTOR, 'aim', { expectedVersion: 1, enabled: false }, { secretResolver: () => RAW_KEY }),
    (error) => error.code === 'ceo_registry_version_conflict',
  );
});

test('Credential rotation requires the new server secret and exposes only version metadata', async () => {
  const fixture = database(entity({ enabled: true, status: 'unreachable', consecutiveErrors: 4, circuitState: 'open' }));
  await assert.rejects(
    () => rotateCeoRegistryCredential(fixture.db, DIRECTOR, 'aim', { expectedVersion: 1, credentialRef: 'CEO_ENTITY_AIM_V2_API_KEY' }, { secretResolver: () => '' }),
    (error) => error.code === 'ceo_registry_rotation_secret_missing',
  );
  const updated = await rotateCeoRegistryCredential(
    fixture.db,
    DIRECTOR,
    'aim',
    { expectedVersion: 1, credentialRef: 'CEO_ENTITY_AIM_V2_API_KEY' },
    { now: NOW, secretResolver: () => RAW_KEY },
  );
  assert.equal(updated.credential.version, 2);
  assert.equal(updated.recordVersion, 2);
  assert.equal(updated.status, 'unverified');
  assert.equal(updated.sync.circuitState, 'closed');
  assert.equal(updated.sync.consecutiveErrors, 0);
  assert.equal(JSON.stringify(updated).includes('CEO_ENTITY_AIM_V2_API_KEY'), false);
  assert.equal(fixture.audits[0].detail.includes('CEO_ENTITY_AIM_V2_API_KEY'), false);
});

test('Circuit breaker opens after three failures, probes after cooldown and closes on success', async () => {
  const fixture = database(entity({ enabled: true, status: 'unverified' }));
  const first = await recordCeoRegistrySyncFailure(fixture.db, 'aim', 'API timeout / upstream', NOW);
  assert.equal(first.status, 'degraded');
  assert.equal(first.circuitState, 'closed');
  await recordCeoRegistrySyncFailure(fixture.db, 'aim', 'api_timeout', new Date(NOW.getTime() + 1_000));
  const third = await recordCeoRegistrySyncFailure(fixture.db, 'aim', 'api_timeout', new Date(NOW.getTime() + 2_000));
  assert.equal(third.consecutiveErrors, 3);
  assert.equal(third.status, 'unreachable');
  assert.equal(third.circuitState, 'open');
  assert.equal(third.lastErrorCode, 'api_timeout');
  assert.equal(ceoCircuitAvailability(third, new Date(NOW.getTime() + 60_000)).allowed, false);
  await assert.rejects(
    () => prepareCeoRegistrySync(fixture.db, 'aim', { now: new Date(NOW.getTime() + 60_000), secretResolver: () => RAW_KEY }),
    (error) => error.code === 'ceo_registry_circuit_open',
  );
  const probe = await prepareCeoRegistrySync(fixture.db, 'aim', {
    now: new Date(NOW.getTime() + 10 * 60_000), secretResolver: () => RAW_KEY,
  });
  assert.equal(probe.mode, 'probe');
  assert.equal(probe.credential, RAW_KEY);
  assert.equal(fixture.state().circuitState, 'half_open');
  await recordCeoRegistrySyncSuccess(fixture.db, 'aim', new Date(NOW.getTime() + 11 * 60_000));
  assert.equal(fixture.state().status, 'ready');
  assert.equal(fixture.state().consecutiveErrors, 0);
  assert.equal(fixture.state().circuitState, 'closed');
});

test('Failure plan sanitizes error codes and applies bounded exponential cooldown', () => {
  const plan = planCeoRegistryFailure(entity({ consecutiveErrors: 7, circuitState: 'open' }), {
    now: NOW, errorCode: 'HTTP 503: upstream leaked detail', baseCooldownMs: 5 * 60_000, maxCooldownMs: 20 * 60_000,
  });
  assert.equal(plan.consecutiveErrors, 8);
  assert.equal(plan.lastErrorCode, 'http_503_upstream_leaked_detail');
  assert.equal(plan.circuitRetryAt.getTime() - NOW.getTime(), 20 * 60_000);
});

test('CEO Registry routes and UI are Director-only, no-store, versioned and non-destructive', () => {
  const files = [
    'app/api/ceo/v1/registry/route.js',
    'app/api/ceo/v1/registry/[id]/route.js',
    'app/api/ceo/v1/registry/[id]/rotate/route.js',
  ];
  const sources = files.map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
  for (const source of sources) {
    assert.match(source, /currentUser\(\)/);
    assert.match(source, /isDirector\(user\)/);
    assert.match(source, /private, no-store/);
    assert.doesNotMatch(source, /export async function DELETE/);
  }
  assert.match(sources[0], /export async function GET/);
  assert.match(sources[1], /export async function PATCH/);
  assert.match(sources[2], /export async function POST/);
  const page = fs.readFileSync(path.join(root, 'app/(app)/ceo-registry/page.jsx'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'lib/erp-navigation.js'), 'utf8');
  assert.match(page, /rolesOf\(session\?\.user\)\.includes\('DIRECTOR'\)/);
  assert.match(page, /data-no-i18n/);
  assert.match(page, /aria-live/);
  assert.match(nav, /key: 'ceo-registry'/);
  assert.doesNotMatch(page, /DELETE/);
});

test('Prisma migration persists references—not credentials—and seeds disabled records', () => {
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260721190000_add_ceo_entity_registry/migration.sql'), 'utf8');
  assert.match(schema, /model CeoEntityRegistry/);
  assert.match(schema, /credentialRef\s+String/);
  assert.doesNotMatch(schema, /rawCredential|apiKeyValue/);
  assert.equal((migration.match(/false, 'unverified'/g) || []).length, 4);
  assert.doesNotMatch(migration, /ak_[a-zA-Z0-9]/);
});
