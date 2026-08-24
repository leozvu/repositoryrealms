import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import {
  authorizeCeoSchemaReconcile,
  CeoSchemaReconcileError,
  planCeoSchemaReconciliation,
} from '../lib/ceo-schema-reconcile.js';

const secret = 's'.repeat(64);
const sha = 'a'.repeat(64);
const request = (value = secret) => ({ headers: { get: (name) => name === 'x-ceo-schema-reconcile-key' ? value : null } });
const body = {
  schema: 'ceoportal', expectedBeforeSha256: sha, backupSha256: sha,
  confirmation: `RECONCILE ceoportal FROM ${sha}`,
};

test('CEO schema reconciliation requires approval, live one-time secret, backup checksum and exact confirmation', () => {
  const env = {
    CEO_SCHEMA_RECONCILE_APPROVED: 'true', CEO_SCHEMA_RECONCILE_SECRET: secret,
    CEO_SCHEMA_RECONCILE_EXPIRES_AT: '2026-08-09T12:00:00.000Z', CEO_SCHEMA_RECONCILE_BACKUP_SHA256: sha,
  };
  assert.equal(authorizeCeoSchemaReconcile(request(), body, env, new Date('2026-08-09T11:00:00.000Z')).schema, 'ceoportal');
  assert.throws(() => authorizeCeoSchemaReconcile(request('wrong'), body, env, new Date('2026-08-09T11:00:00.000Z')), CeoSchemaReconcileError);
  assert.throws(() => authorizeCeoSchemaReconcile(request(), { ...body, confirmation: 'yes' }, env, new Date('2026-08-09T11:00:00.000Z')), CeoSchemaReconcileError);
  assert.throws(() => authorizeCeoSchemaReconcile(request(), body, env, new Date('2026-08-09T12:00:00.000Z')), CeoSchemaReconcileError);
});

test('CEO schema reconciliation plans only the approved additive attendance and lead drift', () => {
  const contract = {
    columns: [
      { table_name: 'Attendance', column_name: 'id' },
      { table_name: 'Lead', column_name: 'id' },
    ],
    indexes: [],
  };
  assert.throws(() => planCeoSchemaReconciliation(contract), (error) => error.code === 'ceo_schema_unexpected_drift');
  const source = fs.readFileSync(new URL('../lib/ceo-schema-reconcile.js', import.meta.url), 'utf8');
  assert.match(source, /ADD COLUMN IF NOT EXISTS/);
  assert.match(source, /CREATE (UNIQUE )?INDEX IF NOT EXISTS/);
  assert.match(source, /pg_try_advisory_xact_lock/);
  assert.doesNotMatch(source, /pg_advisory_xact_lock\(/);
  assert.doesNotMatch(source, /DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE\s+FROM/i);
});

test('CEO schema reconciliation reaches the current Prisma columns with an idempotent 13-operation patch', () => {
  const omitted = new Set([
    'Attendance.checkInIp', 'Attendance.checkOutIp', 'Attendance.checkInPlace',
    'Attendance.checkOutPlace', 'Attendance.contextNote', 'Lead.campaign',
    'Lead.region', 'Lead.serviceLine', 'Lead.intakeKey', 'Lead.intakeAt',
  ]);
  const columns = Prisma.dmmf.datamodel.models.flatMap((model) => {
    const table = model.dbName || model.name;
    return model.fields.filter((field) => field.kind === 'scalar')
      .map((field) => ({ table_name: table, column_name: field.dbName || field.name }))
      .filter((column) => !omitted.has(`${column.table_name}.${column.column_name}`));
  });
  const operations = planCeoSchemaReconciliation({ columns, indexes: [] }).map((patch) => patch.operation);
  assert.equal(operations.length, 13);
  assert.equal(new Set(operations).size, 13);
});

test('CEO schema reconciliation endpoint is POST-only, no-store and disabled without ephemeral env approval', () => {
  const source = fs.readFileSync(new URL('../app/api/ceo/v1/schema-reconcile/route.js', import.meta.url), 'utf8');
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function (GET|PUT|PATCH|DELETE)/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /DIRECT_URL|DATABASE_URL|PrismaClient/);
});
