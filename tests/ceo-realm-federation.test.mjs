import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CEO_FEDERATION_PRESENCE_CONTRACT,
  CEO_FEDERATION_SCOPE,
  buildCeoFederationPresenceEnvelope,
  buildCeoFederationWorld,
  normalizeCeoFederationPolicy,
  normalizeCeoFederationPolicyUpdate,
  sanitizeCeoFederationPresenceEnvelope,
} from '../lib/ceo-federation.js';
import { hashCeoIdentitySecret } from '../lib/ceo-identity.js';
import { loadCeoFederationWorld } from '../lib/ceo-federation-admin.js';
import { updateLocalCeoFederationPolicy } from '../lib/ceo-federation-target-admin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-22T03:00:00.000Z');
const DIRECTOR = { id: 'director-1', name: 'Vũ Lương Sơn', roles: ['DIRECTOR'] };
const RAW_SESSION = 'ceo_federation_browser_session_token_1234567890';
const HASH_SECRET = 'ceo7-test-hash-secret-with-at-least-32-bytes';

const profile = (id, overrides = {}) => ({
  userId: id, sharedWithCeoPortal: true, sharePresence: true, displayName: null, title: null,
  user: { id, name: `Member ${id}`, title: 'Guild Member', status: 'active', userType: 'employee' },
  ...overrides,
});

test('CEO-7 federation policy is fail-closed and validates optimistic updates', () => {
  assert.deepEqual(normalizeCeoFederationPolicy(), { version: 1, presenceEnabled: false, updatedAt: null });
  assert.deepEqual(normalizeCeoFederationPolicyUpdate({ expectedVersion: 2, presenceEnabled: true }), { expectedVersion: 2, presenceEnabled: true });
  assert.throws(() => normalizeCeoFederationPolicyUpdate({ expectedVersion: 1, presenceEnabled: true, roster: [] }), (error) => error.code === 'ceo_federation_policy_invalid');
});

test('CEO-7 presence exposes only active double-opt-in users and no activity history or records', () => {
  const profiles = [
    profile('shared-1'),
    profile('directory-only', { sharePresence: false }),
    profile('private-1', { sharedWithCeoPortal: false }),
    profile('freelancer-1', { user: { id: 'freelancer-1', name: 'External', title: 'Freelancer', status: 'active', userType: 'freelancer' } }),
  ];
  const sessions = profiles.map((item, index) => ({ userId: item.userId, surface: index ? 'erp' : 'realm', availability: 'available', lastSeen: new Date(NOW.getTime() - 5_000) }));
  const result = buildCeoFederationPresenceEnvelope({ entity: { id: 'aim' }, policy: { presenceEnabled: true }, profiles, sessions, asOf: NOW });
  assert.equal(result.contract, CEO_FEDERATION_PRESENCE_CONTRACT);
  assert.equal(result.presence.optedInProfiles, 1);
  assert.equal(result.presence.online, 1);
  assert.deepEqual(result.presence.people.map((person) => person.userId), ['shared-1']);
  assert.deepEqual(Object.keys(result.presence.people[0]).sort(), ['availability', 'displayName', 'surface', 'title', 'userId'].sort());
  assert.doesNotMatch(JSON.stringify(result.presence.people), /email|task|lead|salary|duration|gold|lastSeen/i);
  assert.equal(result.privacy.presenceIsNotProductivity, true);
});

test('CEO-7 disabled local policy returns no opted-in roster even when sessions are active', () => {
  const result = buildCeoFederationPresenceEnvelope({
    entity: { id: 'egoric' }, policy: { presenceEnabled: false }, profiles: [profile('shared-1')],
    sessions: [{ userId: 'shared-1', surface: 'realm', availability: 'available', lastSeen: NOW }], asOf: NOW,
  });
  assert.equal(result.presence.state, 'policy_disabled');
  assert.equal(result.presence.online, 0);
  assert.deepEqual(result.presence.people, []);
});

test('CEO-7 sanitizer rejects hidden record fields and missing privacy evidence', () => {
  const result = buildCeoFederationPresenceEnvelope({ entity: { id: 'aim' }, policy: { presenceEnabled: true }, profiles: [profile('shared-1')], sessions: [{ userId: 'shared-1', surface: 'realm', availability: 'busy', lastSeen: NOW }], asOf: NOW });
  assert.equal(sanitizeCeoFederationPresenceEnvelope(result, { targetEntityId: 'aim', now: NOW }).presence.online, 1);
  const withTask = structuredClone(result); withTask.presence.people[0].taskId = 'task-secret';
  assert.throws(() => sanitizeCeoFederationPresenceEnvelope(withTask, { targetEntityId: 'aim' }), (error) => error.code === 'ceo_federation_person_field_unsupported');
  assert.throws(() => sanitizeCeoFederationPresenceEnvelope({ ...result, privacy: { ...result.privacy, exposesTasks: true } }, { targetEntityId: 'aim' }), (error) => error.code === 'ceo_federation_privacy_evidence_missing');
  assert.throws(() => sanitizeCeoFederationPresenceEnvelope({ ...result, policy: { ...result.policy, presenceEnabled: false } }, { targetEntityId: 'aim' }), (error) => error.code === 'ceo_federation_policy_state_mismatch');
  const unknownState = structuredClone(result); unknownState.presence.people[0].availability = 'watching';
  assert.throws(() => sanitizeCeoFederationPresenceEnvelope(unknownState, { targetEntityId: 'aim' }), (error) => error.code === 'ceo_federation_person_invalid');
  assert.throws(() => sanitizeCeoFederationPresenceEnvelope({ ...result, asOf: new Date(NOW.getTime() - 2 * 60_000).toISOString() }, { targetEntityId: 'aim', now: NOW }), (error) => error.code === 'ceo_federation_presence_stale');
});

test('CEO-7 world degrades one kingdom without disabling other SSO gateways', () => {
  const entity = (id, displayName) => ({ id, displayName, enabled: true, environment: 'production', businessProfile: 'agency' });
  const memberships = [
    { entityId: 'aim', status: 'active', localRole: 'DIRECTOR', entity: entity('aim', 'AIm Agency') },
    { entityId: 'egoric', status: 'active', localRole: 'DIRECTOR', entity: entity('egoric', 'Egoric Agency') },
  ];
  const aimPresence = buildCeoFederationPresenceEnvelope({ entity: { id: 'aim' }, policy: { presenceEnabled: true }, profiles: [], sessions: [], asOf: NOW });
  const world = buildCeoFederationWorld({ memberships, presenceByEntity: new Map([['aim', { ok: true, value: aimPresence }], ['egoric', { ok: false, code: 'ceo_federation_target_timeout' }]]), stepUp: true, asOf: NOW });
  assert.equal(world.kingdoms[0].presence.state, 'available');
  assert.equal(world.kingdoms[1].presence.state, 'degraded');
  assert.equal(world.summary.gatewaysAvailable, 2);
  assert.equal(world.kingdoms[1].gateway.available, true);
  assert.equal(world.kingdoms[0].chat.grantsRecordAccess, false);
  assert.equal(world.invariants.separateEntityRealms, true);
});

test('CEO-7 portal reads a target with audience-bound headers and stores no remote roster', async () => {
  const entity = {
    id: 'aim', displayName: 'AIm Agency', baseUrl: 'https://aim.example.test', enabled: true,
    environment: 'staging', businessProfile: 'agency', capabilities: '["people"]',
    credentialRef: 'CEO_ENTITY_AIM_API_KEY', circuitState: 'closed', consecutiveErrors: 0,
  };
  const identity = { id: 'identity-1', userId: DIRECTOR.id, subject: 'ceo_global_subject_001', status: 'active' };
  const session = {
    id: 'session-1', identityId: identity.id, identity,
    tokenHash: hashCeoIdentitySecret(RAW_SESSION, HASH_SECRET), revokedAt: null,
    stepUpAt: NOW, lastSeenAt: NOW, idleExpiresAt: new Date(NOW.getTime() + 30 * 60_000),
    expiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000),
  };
  const membership = { identityId: identity.id, entityId: entity.id, localRole: 'DIRECTOR', status: 'active', scopes: JSON.stringify([CEO_FEDERATION_SCOPE]), entity };
  const state = { audits: [], registryUpdates: [] };
  const db = {
    ceoPortalSession: { findUnique: async ({ where }) => where.tokenHash === session.tokenHash ? session : null, updateMany: async () => ({ count: 1 }) },
    ceoEntityMembership: { findMany: async () => [membership] },
    ceoEntityRegistry: {
      findUnique: async ({ where }) => where.id === entity.id ? entity : null,
      update: async ({ data }) => { state.registryUpdates.push(data); return { ...entity, ...data }; },
    },
    ceoRolloutState: { findUnique: async ({ where }) => ({ entityId: where.entityId, currentRing: 'ceo_sso', status: 'active', recordVersion: 3 }) },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  let outbound;
  const envelope = buildCeoFederationPresenceEnvelope({ entity, policy: { presenceEnabled: true }, profiles: [profile('shared-1')], sessions: [{ userId: 'shared-1', surface: 'realm', availability: 'available', lastSeen: NOW }], asOf: NOW });
  const world = await loadCeoFederationWorld(db, DIRECTOR, RAW_SESSION, {}, {
    now: NOW, hashSecret: HASH_SECRET, secretResolver: () => 'entity-secret-for-federation',
    allowedOriginResolver: () => ['https://aim.example.test'], timeoutMs: 1_000,
    fetchImpl: async (url, options) => { outbound = { url: String(url), options }; return new Response(JSON.stringify(envelope), { status: 200 }); },
  });
  assert.equal(world.summary.online, 1);
  assert.equal(world.kingdoms[0].gateway.redirectPath, '/realm');
  assert.equal(outbound.url, 'https://aim.example.test/api/ceo/v1/federation/presence');
  assert.equal(outbound.options.headers['X-CEO-Entity-ID'], 'aim');
  assert.equal(outbound.options.headers['X-CEO-Federation-Scope'], CEO_FEDERATION_SCOPE);
  assert.equal(outbound.options.headers['X-CEO-Actor-Subject'], identity.subject);
  assert.equal(outbound.options.redirect, 'error');
  assert.equal(state.audits.at(-1).action, 'ceo_federation_world_viewed');
  assert.equal(JSON.stringify(state).includes('Member shared-1'), false, 'remote roster must remain ephemeral');
});

test('CEO-7 local policy update is versioned, audited and rejects a stale writer', async () => {
  const state = { json: JSON.stringify({ company: 'AIm Agency', ceoFederation: { version: 1, presenceEnabled: false } }), audits: [] };
  const db = {
    $transaction: async (fn) => fn(db),
    setting: {
      findUnique: async () => ({ json: state.json }),
      upsert: async ({ create, update }) => { state.json = update?.json || create.json; return { id: 1, json: state.json }; },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  const updated = await updateLocalCeoFederationPolicy(db, DIRECTOR, { expectedVersion: 1, presenceEnabled: true }, NOW);
  assert.equal(updated.version, 2);
  assert.equal(JSON.parse(state.json).company, 'AIm Agency');
  assert.equal(state.audits[0].action, 'ceo_federation_policy_updated');
  await assert.rejects(updateLocalCeoFederationPolicy(db, DIRECTOR, { expectedVersion: 1, presenceEnabled: false }, NOW), (error) => error.code === 'ceo_federation_policy_conflict');
});

test('CEO-7 routes, capability, SSO gateway UI and generated map are wired without a record API', () => {
  const capability = fs.readFileSync(path.join(root, 'lib/ceo-entity-contract.js'), 'utf8');
  const identity = fs.readFileSync(path.join(root, 'lib/ceo-identity.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'app/(app)/ceo-world/page.jsx'), 'utf8');
  const target = fs.readFileSync(path.join(root, 'app/api/ceo/v1/federation/presence/route.js'), 'utf8');
  const docs = fs.readFileSync(path.join(root, 'docs/realms/CEO-7-REALM-FEDERATION.md'), 'utf8');
  const asset = path.join(root, 'public/realms/assets/generated/ceo-7/ceo-federation-world-map-v1.png');
  assert.match(capability, /federationPresence/);
  assert.match(identity, /CEO_FEDERATION_SCOPE/);
  assert.match(page, /api\/ceo\/v1\/sso\/authorize/);
  assert.match(page, /redirectPath: kingdom\.gateway\.redirectPath/);
  assert.match(page, /cross-entity|Cross-entity/);
  assert.match(target, /assertCeoFederationHeaders/);
  assert.match(docs, /does not return email, raw heartbeat timestamp, duration, task, lead, HR, payroll, finance, Gold/i);
  assert.ok(fs.statSync(asset).size > 100_000);
  assert.equal(CEO_FEDERATION_SCOPE, 'realm.federation.read');
});
