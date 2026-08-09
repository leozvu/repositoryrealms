import { timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { databaseFingerprint, encryptBackup, readPrismaSchemaSnapshot, withSchema } from '../scripts/lib/ceo-production-truth.mjs';

export const CEO_BACKUP_EXPORT_HEADER = 'x-ceo-backup-export-key';
export const CEO_BACKUP_EXPORT_SCHEMAS = Object.freeze(['public', 'egoric', 'vnecom', 'egolive', 'ceoportal']);

const COMPANY_BY_SCHEMA = Object.freeze({
  public: 'AIm Agency',
  egoric: 'Egoric Agency',
  vnecom: 'Vnecom LLC',
  egolive: 'Egolive',
  ceoportal: 'Leoz Group CEO Terminal',
});

export class CeoBackupExportError extends Error {
  constructor(message, status = 404, code = 'ceo_backup_export_unavailable') {
    super(message);
    this.name = 'CeoBackupExportError';
    this.status = status;
    this.code = code;
  }
}

export function safeCeoBackupExportDiagnostic(error) {
  const prismaCode = /^[A-Z][A-Z0-9]{3,9}$/.test(String(error?.code || '')) ? String(error.code) : null;
  const category = ['PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'PrismaClientInitializationError']
    .includes(String(error?.name || '')) ? String(error.name) : 'BackupExportError';
  return { category, prismaCode };
}

function equalSecret(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeCeoBackupExport(request, env = process.env, now = new Date()) {
  const secret = String(env.CEO_BACKUP_EXPORT_SECRET || '');
  const expiresAt = new Date(String(env.CEO_BACKUP_EXPORT_EXPIRES_AT || ''));
  const supplied = request?.headers?.get?.(CEO_BACKUP_EXPORT_HEADER) || '';
  if (secret.length < 48 || Number.isNaN(expiresAt.getTime()) || expiresAt <= now || !equalSecret(supplied, secret)) {
    throw new CeoBackupExportError('Backup export is unavailable.');
  }
  return { secret, expiresAt: expiresAt.toISOString() };
}

export function deploymentBackupSchema(env = process.env) {
  let schema = '';
  try { schema = new URL(String(env.DIRECT_URL || env.DATABASE_URL || '')).searchParams.get('schema') || ''; } catch {}
  if (!schema && env.CEO_ENTITY_ID === 'aim') schema = 'public';
  if (!CEO_BACKUP_EXPORT_SCHEMAS.includes(schema)) throw new CeoBackupExportError('Backup schema is unavailable.');
  return schema;
}

export async function createDeploymentBackupExport({ env = process.env, encryptionSecret }) {
  const schema = deploymentBackupSchema(env);
  const directUrl = String(env.DIRECT_URL || '');
  if (!directUrl) throw new CeoBackupExportError('Backup connection is unavailable.');
  const db = new PrismaClient({ datasources: { db: { url: withSchema(directUrl, schema) } } });
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const { data, counts } = await readPrismaSchemaSnapshot(tx, schema);
      const payload = {
        format: 'repositoryrealms.ceo.schema-snapshot',
        version: 1,
        createdAt: new Date().toISOString(),
        sourceGroup: schema === 'ceoportal' ? 'portal' : 'entity',
        schema,
        company: COMPANY_BY_SCHEMA[schema],
        counts,
        data,
      };
      const encrypted = encryptBackup(payload, encryptionSecret);
      return {
        encrypted,
        schema,
        tables: Object.keys(counts).length,
        rows: Object.values(counts).reduce((sum, value) => sum + value, 0),
        databaseFingerprint: databaseFingerprint(directUrl, schema),
      };
    }, { maxWait: 15_000, timeout: 300_000 });
  } finally {
    await db.$disconnect();
  }
}
