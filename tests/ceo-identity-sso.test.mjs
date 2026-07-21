import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { totp } from '../lib/totp.js';
import {
  CEO_SSO_CODE_TTL_MS,
  capabilitiesToCeoScopes,
  ceoPortalSessionState,
  ceoRequestIsSameOrigin,
  createCeoEntityAssertion,
  hashCeoIdentitySecret,
  normalizeCeoPortalOrigin,
  normalizeCeoRedirectPath,
  verifyCeoEntityAssertion,
} from '../lib/ceo-identity.js';
import {
  CEO_CONTROL_PLANE_RESTORE_CONFIRMATION,
  CEO_CONTROL_PLANE_SUSPEND_CONFIRMATION,
  bootstrapCeoPortalSession,
  exchangeCeoAuthorizationCode,
  issueCeoAuthorizationCode,
  readCeoIdentityState,
  recoverCeoPortalAccount,
  revokeCeoPortalSession,
  rotateCeoRecoveryCodes,
  suspendCeoPortalControlPlane,
} from '../lib/ceo-identity-admin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-07-21T21:30:00.000Z');
const HASH_SECRET = 'ceo3-test-hash-secret-with-at-least-32-bytes';
const ENTITY_SECRET = 'entity-sso-secret-with-at-least-24-bytes';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const DIRECTOR = { id: 'director-1', email: 'giamdoc@agency.vn', name: 'Vũ Lương Sơn', role: 'DIRECTOR', roles: ['DIRECTOR'], teamId: null, userType: 'employee' };

function fixture() {
  const state = {
    user: { ...DIRECTOR, roles: '["DIRECTOR"]', status: 'active', totpSecret: TOTP_SECRET, passwordHash: '$2a$hash' },
    identity: null,
    memberships: [],
    sessions: [],
    recovery: [],
    authCodes: [],
    audits: [],
    entities: [
      { id: 'aim', displayName: 'AIm Agency', baseUrl: 'https://agency-erp-mu.vercel.app', capabilities: '["finance","crm"]', enabled: true, credentialRef: 'CEO_ENTITY_AIM_API_KEY' },
      { id: 'egoric', displayName: 'Egoric Agency', baseUrl: 'https://erp-egoric.vercel.app', capabilities: '["finance","delivery"]', enabled: true, credentialRef: 'CEO_ENTITY_EGORIC_API_KEY' },
      { id: 'vnecom', displayName: 'Vnecom LLC', baseUrl: 'https://erp-vnecom.vercel.app', capabilities: '["finance","crm"]', enabled: false, credentialRef: 'CEO_ENTITY_VNECOM_API_KEY' },
      { id: 'egolive', displayName: 'Egolive', baseUrl: 'https://erp-egolive.vercel.app', capabilities: '["finance","livestream"]', enabled: true, credentialRef: 'CEO_ENTITY_EGOLIVE_API_KEY' },
    ],
  };
  let sequence = 0;
  const id = (prefix) => `${prefix}-${++sequence}`;
  const includeIdentity = (session) => session ? { ...session, identity: { ...state.identity } } : null;
  const tx = {
    user: {
      findUnique: async ({ where }) => (where.id === state.user.id || where.email === state.user.email) ? { ...state.user } : null,
      update: async ({ where, data }) => { assert.equal(where.id, state.user.id); Object.assign(state.user, data); return { ...state.user }; },
    },
    ceoGlobalIdentity: {
      findUnique: async ({ where }) => (state.identity && (where.userId === state.identity.userId || where.id === state.identity.id)) ? { ...state.identity } : null,
      create: async ({ data }) => { state.identity = { id: id('identity'), recoveryVersion: 0, updatedAt: data.createdAt, ...data }; return { ...state.identity }; },
      update: async ({ where, data }) => { assert.equal(where.id, state.identity.id); Object.assign(state.identity, data); return { ...state.identity }; },
      updateMany: async ({ where, data }) => {
        if (!state.identity || (where.id && where.id !== state.identity.id) || (where.status && where.status !== state.identity.status)) return { count: 0 };
        Object.assign(state.identity, data);
        return { count: 1 };
      },
    },
    ceoEntityRegistry: {
      findMany: async () => state.entities.map((row) => ({ ...row })),
      findUnique: async ({ where }) => state.entities.find((row) => row.id === where.id) || null,
    },
    ceoEntityMembership: {
      findMany: async ({ where }) => state.memberships.filter((row) => row.identityId === where.identityId).map((row) => ({ ...row })),
      findUnique: async ({ where }) => {
        const key = where.identityId_entityId;
        return state.memberships.find((row) => row.identityId === key.identityId && row.entityId === key.entityId) || null;
      },
      create: async ({ data }) => { const row = { id: id('membership'), recordVersion: 1, createdAt: NOW, updatedAt: NOW, ...data }; state.memberships.push(row); return { ...row }; },
    },
    ceoPortalSession: {
      create: async ({ data }) => { const row = { id: id('session'), revokedAt: null, revokeReason: null, createdAt: data.lastSeenAt, ...data }; state.sessions.push(row); return { ...row }; },
      findUnique: async ({ where }) => includeIdentity(state.sessions.find((row) => row.tokenHash === where.tokenHash)),
      findMany: async ({ where }) => state.sessions.filter((row) => row.identityId === where.identityId).map((row) => ({ ...row })),
      updateMany: async ({ where, data }) => {
        const rows = state.sessions.filter((item) => (!where.id || item.id === where.id) && (!where.identityId || item.identityId === where.identityId) && (where.revokedAt === undefined || item.revokedAt === where.revokedAt));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
    },
    ceoRecoveryCode: {
      count: async ({ where }) => state.recovery.filter((row) => row.identityId === where.identityId && row.version === where.version && row.usedAt === where.usedAt).length,
      createMany: async ({ data }) => { state.recovery.push(...data.map((row) => ({ id: id('recovery'), usedAt: null, ...row }))); return { count: data.length }; },
      findUnique: async ({ where }) => state.recovery.find((row) => row.codeHash === where.codeHash) || null,
      updateMany: async ({ where, data }) => { const row = state.recovery.find((item) => item.id === where.id && item.usedAt === where.usedAt && item.version === where.version); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
    },
    ceoSsoAuthorizationCode: {
      create: async ({ data }) => { const row = { id: id('authorization'), consumedAt: null, ...data }; state.authCodes.push(row); return { ...row }; },
      findUnique: async ({ where }) => {
        const row = state.authCodes.find((item) => item.codeHash === where.codeHash);
        if (!row) return null;
        return { ...row, identity: { ...state.identity }, session: includeIdentity(state.sessions.find((item) => item.id === row.sessionId)) };
      },
      updateMany: async ({ where, data }) => {
        if (where.identityId) {
          const rows = state.authCodes.filter((item) => item.identityId === where.identityId && (where.consumedAt === undefined || item.consumedAt === where.consumedAt));
          for (const row of rows) Object.assign(row, data);
          return { count: rows.length };
        }
        const row = state.authCodes.find((item) => item.id === where.id && item.consumedAt === where.consumedAt && new Date(item.expiresAt) > where.expiresAt.gt);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return { db: { ...tx, $transaction: async (operation) => operation(tx) }, state };
}

test('CEO-3 rejects open redirects and signs audience-bound short-lived assertions', () => {
  assert.equal(normalizeCeoRedirectPath('/projects/abc?tab=health'), '/projects/abc?tab=health');
  for (const pathValue of ['https://evil.test', '//evil.test', '/api/ceo/v1/sso/callback', '/safe\\evil']) {
    assert.throws(() => normalizeCeoRedirectPath(pathValue), (error) => error.code === 'ceo_sso_redirect_invalid');
  }
  assert.equal(normalizeCeoPortalOrigin('https://portal.example.test'), 'https://portal.example.test');
  assert.throws(() => normalizeCeoPortalOrigin('http://portal.example.test'));
  const request = (origin, site = 'same-origin') => ({ nextUrl: { origin: 'https://portal.example.test' }, headers: { get: (name) => name === 'origin' ? origin : name === 'sec-fetch-site' ? site : null } });
  assert.equal(ceoRequestIsSameOrigin(request('https://portal.example.test')), true);
  assert.equal(ceoRequestIsSameOrigin(request('https://evil.example.test', 'cross-site')), false);
  const assertion = createCeoEntityAssertion({ entitySecret: ENTITY_SECRET, payload: { iss: 'repositoryrealms-ceo-portal', aud: 'aim', sub: 'ceo_subject', role: 'DIRECTOR', localUserEmail: DIRECTOR.email, scopes: ['entity.open'], nonce: 'nonce-value', redirectPath: '/dashboard', iat: Math.floor(NOW.getTime() / 1000), exp: Math.floor((NOW.getTime() + 30_000) / 1000) } });
  assert.equal(verifyCeoEntityAssertion({ assertion, entityId: 'aim', entitySecret: ENTITY_SECRET, now: NOW }).sub, 'ceo_subject');
  assert.throws(() => verifyCeoEntityAssertion({ assertion, entityId: 'egoric', entitySecret: ENTITY_SECRET, now: NOW }), (error) => error.code === 'ceo_sso_assertion_claims_invalid');
  assert.throws(() => verifyCeoEntityAssertion({ assertion, entityId: 'aim', entitySecret: `${ENTITY_SECRET}x`, now: NOW }), (error) => error.code === 'ceo_sso_assertion_invalid');
});

test('password + TOTP bootstrap creates one global subject, four scoped memberships and a revocable session', async () => {
  const { db, state } = fixture();
  const created = await bootstrapCeoPortalSession(db, DIRECTOR, { otp: totp(TOTP_SECRET), deviceLabel: 'Surface CEO' }, { now: NOW, hashSecret: HASH_SECRET, userAgent: 'browser', ip: '127.0.0.1' });
  assert.match(created.identity.subject, /^ceo_/);
  assert.equal(state.memberships.length, 4);
  assert.deepEqual(JSON.parse(state.memberships[0].scopes), capabilitiesToCeoScopes(['finance', 'crm']));
  assert.equal(JSON.stringify(state).includes(created.token), false, 'raw session token must never be persisted');
  assert.equal(ceoPortalSessionState({ ...state.sessions[0], identity: state.identity }, NOW).stepUp, true);
  const identityState = await readCeoIdentityState(db, DIRECTOR, created.token, { now: NOW, hashSecret: HASH_SECRET });
  assert.equal(identityState.active, true);
  assert.equal(identityState.memberships.length, 4);
  const revoked = await revokeCeoPortalSession(db, DIRECTOR, created.token, created.session.id, { now: NOW, hashSecret: HASH_SECRET });
  assert.equal(revoked.currentRevoked, true);
  await assert.rejects(() => readCeoIdentityState(db, DIRECTOR, created.token, { now: NOW, hashSecret: HASH_SECRET }), (error) => error.code === 'ceo_session_revoked');
});

test('recovery codes are returned once, stored as hashes and old versions become unusable', async () => {
  const { db, state } = fixture();
  const created = await bootstrapCeoPortalSession(db, DIRECTOR, { otp: totp(TOTP_SECRET) }, { now: NOW, hashSecret: HASH_SECRET });
  const first = await rotateCeoRecoveryCodes(db, DIRECTOR, created.token, { now: NOW, hashSecret: HASH_SECRET });
  assert.equal(first.codes.length, 10);
  assert.equal(first.version, 1);
  assert.equal(state.recovery.length, 10);
  assert.equal(JSON.stringify(state.recovery).includes(first.codes[0]), false);
  const second = await rotateCeoRecoveryCodes(db, DIRECTOR, created.token, { now: new Date(NOW.getTime() + 1_000), hashSecret: HASH_SECRET });
  assert.equal(second.version, 2);
  assert.equal(state.identity.recoveryVersion, 2);
});

test('a recovery code is single-use, creates recovery assurance and clears login failures', async () => {
  const { db, state } = fixture();
  state.user.passwordHash = await bcrypt.hash('Strong recovery password', 4);
  const created = await bootstrapCeoPortalSession(db, DIRECTOR, { otp: totp(TOTP_SECRET) }, { now: NOW, hashSecret: HASH_SECRET });
  const recovery = await rotateCeoRecoveryCodes(db, DIRECTOR, created.token, { now: NOW, hashSecret: HASH_SECRET });
  state.user.loginFails = 2;
  const result = await recoverCeoPortalAccount(db, { email: DIRECTOR.email, password: 'Strong recovery password', recoveryCode: recovery.codes[0], deviceLabel: 'Emergency laptop' }, { now: new Date(NOW.getTime() + 1_000), hashSecret: HASH_SECRET });
  assert.equal(result.session.assuranceLevel, 'recovery');
  assert.equal(result.session.stepUpAt, null);
  assert.equal(state.user.loginFails, 0);
  await assert.rejects(() => recoverCeoPortalAccount(db, { email: DIRECTOR.email, password: 'Strong recovery password', recoveryCode: recovery.codes[0] }, { now: new Date(NOW.getTime() + 2_000), hashSecret: HASH_SECRET }), (error) => error.code === 'ceo_recovery_invalid');
});

test('CEO-8 kill switch revokes the Portal only and break-glass recovery restores it without touching local ERP login', async () => {
  const { db, state } = fixture();
  state.user.passwordHash = await bcrypt.hash('Strong recovery password', 4);
  const created = await bootstrapCeoPortalSession(db, DIRECTOR, { otp: totp(TOTP_SECRET) }, { now: NOW, hashSecret: HASH_SECRET });
  const recovery = await rotateCeoRecoveryCodes(db, DIRECTOR, created.token, { now: NOW, hashSecret: HASH_SECRET });
  const result = await suspendCeoPortalControlPlane(db, DIRECTOR, created.token, {
    confirmation: CEO_CONTROL_PLANE_SUSPEND_CONFIRMATION,
    reason: 'Suspected service credential exposure',
  }, { now: new Date(NOW.getTime() + 1_000), hashSecret: HASH_SECRET });
  assert.equal(result.localErpLoginPreserved, true);
  assert.equal(result.entityBusinessDatabasesTouched, false);
  assert.equal(state.identity.status, 'suspended');
  assert.equal(state.user.status, 'active');
  assert.ok(state.sessions.every((session) => session.revokedAt));
  const restored = await recoverCeoPortalAccount(db, {
    email: DIRECTOR.email,
    password: 'Strong recovery password',
    recoveryCode: recovery.codes[0],
    reactivate: true,
    confirmation: CEO_CONTROL_PLANE_RESTORE_CONFIRMATION,
  }, { now: new Date(NOW.getTime() + 2_000), hashSecret: HASH_SECRET });
  assert.equal(restored.identity.status, 'active');
  assert.equal(restored.session.assuranceLevel, 'recovery');
  assert.equal(restored.session.stepUpAt, null);
  assert.equal(state.user.status, 'active');
});

test('one-time authorization code is opaque, expires in 45 seconds and replay is rejected', async () => {
  const { db, state } = fixture();
  const created = await bootstrapCeoPortalSession(db, DIRECTOR, { otp: totp(TOTP_SECRET) }, { now: NOW, hashSecret: HASH_SECRET });
  const issued = await issueCeoAuthorizationCode(db, DIRECTOR, created.token, { entityId: 'aim', redirectPath: '/projects/project-1' }, { now: NOW, hashSecret: HASH_SECRET });
  const target = new URL(issued.destination);
  const code = target.searchParams.get('code');
  const stateValue = target.searchParams.get('state');
  assert.equal(issued.expiresAt.getTime() - NOW.getTime(), CEO_SSO_CODE_TTL_MS);
  assert.equal(JSON.stringify(state.authCodes).includes(code), false, 'raw authorization code must not be stored');
  const request = { headers: { get: (name) => name === 'authorization' ? `Bearer ${ENTITY_SECRET}` : null } };
  const exchanged = await exchangeCeoAuthorizationCode(db, request, { entityId: 'aim', code, state: stateValue }, { now: new Date(NOW.getTime() + 1_000), hashSecret: HASH_SECRET, secretResolver: () => ENTITY_SECRET });
  const assertion = verifyCeoEntityAssertion({ assertion: exchanged.assertion, entityId: 'aim', entitySecret: ENTITY_SECRET, now: new Date(NOW.getTime() + 1_000) });
  assert.equal(assertion.localUserEmail, DIRECTOR.email);
  assert.equal(assertion.redirectPath, '/projects/project-1');
  await assert.rejects(() => exchangeCeoAuthorizationCode(db, request, { entityId: 'aim', code, state: stateValue }, { now: new Date(NOW.getTime() + 2_000), hashSecret: HASH_SECRET, secretResolver: () => ENTITY_SECRET }), (error) => error.code === 'ceo_sso_code_replayed');
  await assert.rejects(() => issueCeoAuthorizationCode(db, DIRECTOR, created.token, { entityId: 'vnecom' }, { now: NOW, hashSecret: HASH_SECRET }), (error) => error.code === 'ceo_sso_entity_disabled');
});

test('CEO-3 routes enforce origin, audience, local Director mapping and private no-store responses', () => {
  const routeFiles = [
    'app/api/ceo/v1/identity/session/route.js',
    'app/api/ceo/v1/identity/session/step-up/route.js',
    'app/api/ceo/v1/identity/recovery/route.js',
    'app/api/ceo/v1/identity/recover/route.js',
    'app/api/ceo/v1/identity/sessions/[id]/revoke/route.js',
    'app/api/ceo/v1/sso/authorize/route.js',
    'app/api/ceo/v1/sso/exchange/route.js',
    'app/api/ceo/v1/sso/callback/route.js',
  ];
  const sources = routeFiles.map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
  const httpSource = fs.readFileSync(path.join(root, 'lib/ceo-identity-http.js'), 'utf8');
  assert.match(sources[0], /currentUser\(\)/);
  for (const index of [0, 1, 2, 3, 4, 5]) assert.match(sources[index], /ceoRequestIsSameOrigin/);
  assert.match(sources[6], /exchangeCeoAuthorizationCode/);
  assert.match(sources[7], /verifyCeoEntityAssertion/);
  assert.match(sources[7], /rolesOf\(localUser\)\.includes\('DIRECTOR'\)/);
  assert.match(httpSource, /private, no-cache, no-store/);
  assert.doesNotMatch(sources.join('\n'), /redirectPath\s*=\s*request\.nextUrl\.searchParams/);
});

test('Prisma migration stores hashes and relations without raw token/code columns', () => {
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260721213000_add_ceo_identity_sso/migration.sql'), 'utf8');
  for (const model of ['CeoGlobalIdentity', 'CeoEntityMembership', 'CeoPortalSession', 'CeoRecoveryCode', 'CeoSsoAuthorizationCode']) assert.match(schema, new RegExp(`model ${model}`));
  assert.match(schema, /tokenHash\s+String/);
  assert.match(schema, /codeHash\s+String/);
  assert.doesNotMatch(schema, /rawToken|rawCode|recoveryCode\s+String/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /"token" TEXT|"code" TEXT|"password" TEXT/);
  assert.equal(hashCeoIdentitySecret('sample', HASH_SECRET).length, 64);
});
