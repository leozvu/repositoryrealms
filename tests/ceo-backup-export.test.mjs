import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  authorizeCeoBackupExport,
  CeoBackupExportError,
  deploymentBackupSchema,
} from '../lib/ceo-backup-export.js';

const secret = 'b'.repeat(64);
const request = (value) => ({ headers: { get: (name) => name === 'x-ceo-backup-export-key' ? value : null } });

test('CEO backup export requires a strong exact secret and a live expiry', () => {
  const env = { CEO_BACKUP_EXPORT_SECRET: secret, CEO_BACKUP_EXPORT_EXPIRES_AT: '2026-08-09T12:00:00.000Z' };
  assert.equal(authorizeCeoBackupExport(request(secret), env, new Date('2026-08-09T11:00:00.000Z')).secret, secret);
  assert.throws(() => authorizeCeoBackupExport(request('wrong'), env, new Date('2026-08-09T11:00:00.000Z')), CeoBackupExportError);
  assert.throws(() => authorizeCeoBackupExport(request(secret), env, new Date('2026-08-09T12:00:00.000Z')), CeoBackupExportError);
});

test('CEO backup export accepts only the five explicit deployment schemas', () => {
  assert.equal(deploymentBackupSchema({ DIRECT_URL: 'postgresql://u:p@db/app?schema=egoric' }), 'egoric');
  assert.equal(deploymentBackupSchema({ DIRECT_URL: 'postgresql://u:p@db/app', CEO_ENTITY_ID: 'aim' }), 'public');
  assert.throws(() => deploymentBackupSchema({ DIRECT_URL: 'postgresql://u:p@db/app?schema=fretas' }), CeoBackupExportError);
});

test('CEO backup route is node-only, encrypted, expiring and cache-disabled', () => {
  const source = fs.readFileSync(new URL('../app/api/ceo/v1/backup-export/route.js', import.meta.url), 'utf8');
  assert.match(source, /runtime = 'nodejs'/);
  assert.match(source, /application\/vnd\.repositoryrealms\.encrypted-backup/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /DATABASE_URL|DIRECT_URL|PrismaClient/);
});
