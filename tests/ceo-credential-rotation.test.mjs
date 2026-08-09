import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  authorizeCeoCredentialRotation,
  CeoCredentialRotationError,
  rotateCeoCredential,
} from '../lib/ceo-credential-rotation.js';

const secret = 'r'.repeat(64);
const sha = 'a'.repeat(64);
const env = {
  CEO_CREDENTIAL_ROTATION_APPROVED: 'true',
  CEO_CREDENTIAL_ROTATION_SECRET: secret,
  CEO_CREDENTIAL_ROTATION_EXPIRES_AT: '2026-08-09T12:00:00.000Z',
  CEO_CREDENTIAL_ROTATION_EMAIL: 'leozvu.work@gmail.com',
  CEO_CREDENTIAL_ROTATION_BACKUP_SHA256: sha,
  DIRECT_URL: 'postgresql://u:p@db/app?schema=ceoportal',
};
const body = {
  userId: 'user-ceo-0001', email: 'leozvu.work@gmail.com', backupSha256: sha,
  confirmation: 'ROTATE CEO CREDENTIALS user-ceo-0001',
  passwordHash: '$2b$10$.....................................................',
  totpSecret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
};
const request = (value = secret) => ({ headers: { get: (name) => name === 'x-ceo-credential-rotation-key' ? value : null } });

test('CEO credential rotation is one-time, backup-bound and CEO-portal-only', () => {
  assert.equal(authorizeCeoCredentialRotation(request(), body, env, new Date('2026-08-09T11:00:00Z')).email, body.email);
  assert.throws(() => authorizeCeoCredentialRotation(request('wrong'), body, env, new Date('2026-08-09T11:00:00Z')), CeoCredentialRotationError);
  assert.throws(() => authorizeCeoCredentialRotation(request(), { ...body, backupSha256: 'b'.repeat(64) }, env, new Date('2026-08-09T11:00:00Z')), CeoCredentialRotationError);
  assert.throws(() => authorizeCeoCredentialRotation(request(), body, { ...env, DIRECT_URL: 'postgresql://u:p@db/app?schema=public' }, new Date('2026-08-09T11:00:00Z')), CeoCredentialRotationError);
});

test('CEO credential rotation revokes CEO sessions and codes without touching entity passwords', async () => {
  const writes = [];
  const tx = {
    user: {
      findUnique: async () => ({ id: body.userId, email: body.email, name: 'Vũ Lương Sơn', role: 'DIRECTOR', roles: '["DIRECTOR"]', status: 'active' }),
      update: async (value) => { writes.push(['user', value]); return {}; },
    },
    ceoGlobalIdentity: { findUnique: async () => ({ id: 'identity-1', subject: 'ceo_subject', status: 'active' }) },
    ceoPortalSession: { updateMany: async (value) => { writes.push(['sessions', value]); return { count: 2 }; } },
    ceoSsoAuthorizationCode: { updateMany: async (value) => { writes.push(['codes', value]); return { count: 1 }; } },
    auditLog: { create: async (value) => { writes.push(['audit', value]); return {}; } },
  };
  const db = { $transaction: async (fn) => fn(tx) };
  const result = await rotateCeoCredential({ db, authorization: { ...body }, now: new Date('2026-08-09T11:00:00Z') });
  assert.equal(result.sessionsRevoked, 2);
  assert.equal(result.localEntityPasswordsChanged, false);
  assert.equal(writes.filter(([kind]) => kind === 'user').length, 1);
  assert.equal(JSON.stringify(writes).includes(body.passwordHash), true);
  assert.equal(JSON.stringify(writes).includes('entityPassword'), false);
});

test('CEO credential rotation route is POST-only, no-store and does not import database secrets', () => {
  const source = fs.readFileSync(new URL('../app/api/ceo/v1/credential-rotation/route.js', import.meta.url), 'utf8');
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function (GET|PUT|PATCH|DELETE)/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /DIRECT_URL|DATABASE_URL|PrismaClient/);
});
