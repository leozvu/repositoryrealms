import { timingSafeEqual } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { deploymentBackupSchema } from './ceo-backup-export.js';
import { readDatabaseSchemaContract, withSchema } from '../scripts/lib/ceo-production-truth.mjs';

export const CEO_SCHEMA_RECONCILE_HEADER = 'x-ceo-schema-reconcile-key';

const HEX_64 = /^[a-f0-9]{64}$/;
const PATCHES = Object.freeze([
  { table: 'Attendance', column: 'checkInIp', sql: 'ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkInIp" TEXT', operation: 'attendance.check-in-ip' },
  { table: 'Attendance', column: 'checkOutIp', sql: 'ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkOutIp" TEXT', operation: 'attendance.check-out-ip' },
  { table: 'Attendance', column: 'checkInPlace', sql: 'ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkInPlace" TEXT', operation: 'attendance.check-in-place' },
  { table: 'Attendance', column: 'checkOutPlace', sql: 'ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "checkOutPlace" TEXT', operation: 'attendance.check-out-place' },
  { table: 'Attendance', column: 'contextNote', sql: 'ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "contextNote" TEXT', operation: 'attendance.context-note' },
  { table: 'Lead', column: 'campaign', sql: 'ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "campaign" TEXT', operation: 'lead.campaign' },
  { table: 'Lead', column: 'region', sql: 'ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "region" TEXT', operation: 'lead.region' },
  { table: 'Lead', column: 'serviceLine', sql: 'ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "serviceLine" TEXT', operation: 'lead.service-line' },
  { table: 'Lead', column: 'intakeKey', sql: 'ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "intakeKey" TEXT', operation: 'lead.intake-key' },
  { table: 'Lead', column: 'intakeAt', sql: 'ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "intakeAt" TIMESTAMP(3)', operation: 'lead.intake-at' },
]);

const INDEX_PATCHES = Object.freeze([
  { name: 'Lead_intakeKey_key', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS "Lead_intakeKey_key" ON "Lead"("intakeKey")', operation: 'lead.intake-key.unique' },
  { name: 'Lead_campaign_idx', sql: 'CREATE INDEX IF NOT EXISTS "Lead_campaign_idx" ON "Lead"("campaign")', operation: 'lead.campaign.index' },
  { name: 'Lead_ownerId_stage_idx', sql: 'CREATE INDEX IF NOT EXISTS "Lead_ownerId_stage_idx" ON "Lead"("ownerId", "stage")', operation: 'lead.owner-stage.index' },
]);

export class CeoSchemaReconcileError extends Error {
  constructor(message, status = 409, code = 'ceo_schema_reconcile_rejected') {
    super(message);
    this.name = 'CeoSchemaReconcileError';
    this.status = status;
    this.code = code;
  }
}

function equalSecret(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeCeoSchemaReconcile(request, body, env = process.env, now = new Date()) {
  const secret = String(env.CEO_SCHEMA_RECONCILE_SECRET || '');
  const supplied = request?.headers?.get?.(CEO_SCHEMA_RECONCILE_HEADER) || '';
  const expiresAt = new Date(String(env.CEO_SCHEMA_RECONCILE_EXPIRES_AT || ''));
  const backupSha256 = String(env.CEO_SCHEMA_RECONCILE_BACKUP_SHA256 || '');
  const expectedBeforeSha256 = String(body?.expectedBeforeSha256 || '');
  const schema = String(body?.schema || '');
  const confirmation = `RECONCILE ${schema} FROM ${expectedBeforeSha256}`;
  if (env.CEO_SCHEMA_RECONCILE_APPROVED !== 'true'
    || secret.length < 48
    || !equalSecret(supplied, secret)
    || Number.isNaN(expiresAt.getTime())
    || expiresAt <= now
    || !HEX_64.test(backupSha256)
    || body?.backupSha256 !== backupSha256
    || !HEX_64.test(expectedBeforeSha256)
    || body?.confirmation !== confirmation) {
    throw new CeoSchemaReconcileError('Schema reconciliation is unavailable.', 404, 'ceo_schema_reconcile_unavailable');
  }
  return { schema, expectedBeforeSha256, backupSha256 };
}

export function prismaColumnDiff(contract) {
  const actual = new Map();
  for (const column of contract?.columns || []) {
    if (!actual.has(column.table_name)) actual.set(column.table_name, new Set());
    actual.get(column.table_name).add(column.column_name);
  }
  const missing = [];
  const extra = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName || model.name;
    const current = actual.get(table) || new Set();
    const expected = model.fields.filter((field) => field.kind === 'scalar').map((field) => field.dbName || field.name);
    for (const column of expected) if (!current.has(column)) missing.push(`${table}.${column}`);
    for (const column of current) if (!expected.includes(column)) extra.push(`${table}.${column}`);
  }
  return { missing: missing.sort(), extra: extra.sort() };
}

export function planCeoSchemaReconciliation(contract) {
  const diff = prismaColumnDiff(contract);
  const allowed = new Set(PATCHES.map((patch) => `${patch.table}.${patch.column}`));
  const unexpected = diff.missing.filter((column) => !allowed.has(column));
  if (unexpected.length || diff.extra.length) {
    throw new CeoSchemaReconcileError('Schema contains drift outside the approved additive patch.', 409, 'ceo_schema_unexpected_drift');
  }
  const missing = new Set(diff.missing);
  const indexes = new Set((contract?.indexes || []).map((index) => index.index_name));
  return [
    ...PATCHES.filter((patch) => missing.has(`${patch.table}.${patch.column}`)),
    ...INDEX_PATCHES.filter((patch) => !indexes.has(patch.name)),
  ];
}

export async function reconcileSchemaContract({ db, schema, expectedBeforeSha256 }) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('repositoryrealms:ceo-schema-reconcile'))");
    const before = await readDatabaseSchemaContract(tx, schema);
    if (before.sha256 !== expectedBeforeSha256) {
      throw new CeoSchemaReconcileError('Schema changed after backup evidence was captured.', 409, 'ceo_schema_contract_changed');
    }
    const plan = planCeoSchemaReconciliation(before);
    for (const patch of plan) await tx.$executeRawUnsafe(patch.sql);
    const after = await readDatabaseSchemaContract(tx, schema);
    const afterDiff = prismaColumnDiff(after);
    if (afterDiff.missing.length || afterDiff.extra.length) {
      throw new CeoSchemaReconcileError('Schema reconciliation did not reach the Prisma column contract.', 500, 'ceo_schema_reconcile_incomplete');
    }
    return {
      schema,
      beforeSha256: before.sha256,
      afterSha256: after.sha256,
      operations: plan.map((patch) => patch.operation),
      migrationLedgerEntries: after.migrations.length,
    };
  }, { maxWait: 15_000, timeout: 60_000 });
}

export async function reconcileDeploymentSchema({ request, body, env = process.env }) {
  const authorization = authorizeCeoSchemaReconcile(request, body, env);
  const schema = deploymentBackupSchema(env);
  if (authorization.schema !== schema) throw new CeoSchemaReconcileError('Deployment schema mismatch.');
  const directUrl = String(env.DIRECT_URL || '');
  if (!directUrl) throw new CeoSchemaReconcileError('Schema connection is unavailable.', 404, 'ceo_schema_reconcile_unavailable');
  const db = new PrismaClient({ datasources: { db: { url: withSchema(directUrl, schema) } } });
  try {
    return await reconcileSchemaContract({ db, schema, expectedBeforeSha256: authorization.expectedBeforeSha256 });
  } finally {
    await db.$disconnect();
  }
}
