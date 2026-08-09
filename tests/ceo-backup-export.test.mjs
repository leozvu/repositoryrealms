import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  authorizeCeoBackupExport,
  CeoBackupExportError,
  deploymentBackupSchema,
  safeCeoBackupExportDiagnostic,
} from '../lib/ceo-backup-export.js';
import { readDatabaseSchemaContract } from '../scripts/lib/ceo-production-truth.mjs';

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

test('CEO backup diagnostics expose only a bounded error category and Prisma code', () => {
  const diagnostic = safeCeoBackupExportDiagnostic({ name: 'PrismaClientKnownRequestError', code: 'P2022', message: 'secret database URL' });
  assert.deepEqual(diagnostic, { category: 'PrismaClientKnownRequestError', prismaCode: 'P2022' });
  assert.equal(JSON.stringify(diagnostic).includes('secret'), false);
});

test('CEO backup schema contract captures columns, constraints and indexes without row data', async () => {
  const calls = [];
  const db = {
    async $queryRawUnsafe(sql, schema) {
      calls.push({ sql, schema });
      if (sql.includes('information_schema.columns')) return [{ table_name: 'User', column_name: 'id', ordinal_position: 1 }];
      if (sql.includes('pg_constraint')) return [{ table_name: 'User', constraint_name: 'User_pkey' }];
      return [{ table_name: 'User', index_name: 'User_pkey' }];
    },
  };
  const contract = await readDatabaseSchemaContract(db, 'ceoportal');
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.schema === 'ceoportal'));
  assert.equal(contract.columns[0].column_name, 'id');
  assert.equal(contract.constraints[0].constraint_name, 'User_pkey');
  assert.equal(contract.indexes[0].index_name, 'User_pkey');
  assert.match(contract.sha256, /^[a-f0-9]{64}$/);
  assert.equal('data' in contract, false);
});
