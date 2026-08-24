import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { Prisma, PrismaClient } from '@prisma/client';

export const CEO_BACKUP_FORMAT = 'repositoryrealms.ceo.encrypted-backup';
export const CEO_BACKUP_VERSION = 1;
export const CEO_REHEARSAL_PREFIX = 'rr_rehearsal_';

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const DATABASE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function quoteIdentifier(value) {
  const normalized = String(value || '');
  if (!IDENTIFIER.test(normalized)) throw new Error(`Unsafe PostgreSQL identifier: ${normalized}`);
  return `"${normalized}"`;
}

function quoteDatabaseIdentifier(value) {
  const normalized = String(value || '');
  if (!DATABASE_IDENTIFIER.test(normalized)) throw new Error(`Unsafe PostgreSQL database identifier: ${normalized}`);
  return `"${normalized}"`;
}

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function readEnvFile(file) {
  return parseEnvText(fs.readFileSync(file, 'utf8'));
}

export function withSchema(rawUrl, schema) {
  if (!IDENTIFIER.test(String(schema || ''))) throw new Error('Invalid database schema.');
  const url = new URL(String(rawUrl || ''));
  url.searchParams.set('schema', schema);
  return url.toString();
}

export function databaseFingerprint(rawUrl, schema) {
  const url = new URL(withSchema(rawUrl, schema));
  return sha256(`${url.protocol}//${url.hostname}:${url.port || 'default'}${url.pathname}?schema=${schema}`);
}

function backupKey(secret, salt) {
  if (String(secret || '').length < 32) throw new Error('Backup encryption secret must contain at least 32 characters.');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), salt, Buffer.from('repositoryrealms-ceo-backup-v1'), 32));
}

function portableReplacer(_key, value) {
  if (typeof value === 'bigint') return { $rrType: 'bigint', value: value.toString() };
  return value;
}

export function encryptBackup(payload, secret, random = randomBytes) {
  const salt = random(16);
  const iv = random(12);
  const key = backupKey(secret, salt);
  const plaintext = gzipSync(Buffer.from(JSON.stringify(payload, portableReplacer)));
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(CEO_BACKUP_FORMAT));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = {
    format: CEO_BACKUP_FORMAT,
    version: CEO_BACKUP_VERSION,
    algorithm: 'aes-256-gcm+gzip',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return Buffer.from(`${JSON.stringify(envelope)}\n`);
}

export function decryptBackup(buffer, secret) {
  const envelope = JSON.parse(Buffer.from(buffer).toString('utf8'));
  if (envelope.format !== CEO_BACKUP_FORMAT || envelope.version !== CEO_BACKUP_VERSION) {
    throw new Error('Unsupported RepositoryRealms backup envelope.');
  }
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', backupKey(secret, salt), iv);
  decipher.setAAD(Buffer.from(CEO_BACKUP_FORMAT));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const compressed = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(gunzipSync(compressed).toString('utf8'));
}

function delegateName(modelName) {
  return modelName[0].toLowerCase() + modelName.slice(1);
}

function modelTable(model) {
  return model.dbName || model.name;
}

async function tableNames(db, schema) {
  const rows = await db.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
    schema,
  );
  return new Set(rows.map((row) => row.table_name));
}

export async function readDatabaseSchemaContract(db, schema) {
  if (!IDENTIFIER.test(String(schema || ''))) throw new Error('Invalid database schema.');
  const [columns, constraints, indexes] = await Promise.all([
    db.$queryRawUnsafe(`
      SELECT table_name, column_name, ordinal_position, data_type, udt_name,
             is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position
    `, schema),
    db.$queryRawUnsafe(`
      SELECT r.relname AS table_name, c.conname AS constraint_name,
             c.contype AS constraint_type, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = $1
      ORDER BY r.relname, c.conname
    `, schema),
    db.$queryRawUnsafe(`
      SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = $1
      ORDER BY tablename, indexname
    `, schema),
  ]);
  const hasMigrationLedger = columns.some((column) => column.table_name === '_prisma_migrations');
  const migrations = hasMigrationLedger
    ? await db.$queryRawUnsafe(`
        SELECT migration_name, checksum, started_at, finished_at, rolled_back_at,
               applied_steps_count
        FROM ${quoteDatabaseIdentifier(schema)}."_prisma_migrations"
        ORDER BY started_at, migration_name
      `)
    : [];
  const contract = { columns, constraints, indexes, migrations };
  return {
    ...contract,
    sha256: sha256(JSON.stringify(contract, portableReplacer)),
  };
}

export async function readPrismaSchemaSnapshot(db, schema) {
  const existing = await tableNames(db, schema);
  const data = {};
  const counts = {};
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = modelTable(model);
    if (!existing.has(table)) continue;
    const rows = await db.$queryRawUnsafe(
      `SELECT * FROM ${quoteDatabaseIdentifier(schema)}.${quoteDatabaseIdentifier(table)}`,
    );
    data[model.name] = rows;
    counts[model.name] = rows.length;
  }
  return { data, counts };
}

export async function backupSchema({ directUrl, schema, company, sourceGroup, encryptionSecret }) {
  const db = new PrismaClient({ datasources: { db: { url: withSchema(directUrl, schema) } } });
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [{ data, counts }, schemaContract] = await Promise.all([
        readPrismaSchemaSnapshot(tx, schema),
        readDatabaseSchemaContract(tx, schema),
      ]);
      const payload = {
        format: 'repositoryrealms.ceo.schema-snapshot',
        version: 1,
        createdAt: new Date().toISOString(),
        sourceGroup,
        schema,
        company,
        counts,
        data,
        schemaContract,
      };
      const encrypted = encryptBackup(payload, encryptionSecret);
      return {
        payload,
        encrypted,
        summary: {
          schema,
          company,
          sourceGroup,
          databaseFingerprint: databaseFingerprint(directUrl, schema),
          tables: Object.keys(counts).length,
          rows: Object.values(counts).reduce((sum, value) => sum + value, 0),
          encryptedSha256: sha256(encrypted),
        },
      };
    }, { maxWait: 15_000, timeout: 300_000 });
  } finally {
    await db.$disconnect();
  }
}

function scalarValue(type, value) {
  if (value == null) return value;
  if (type === 'DateTime') return new Date(value);
  if (type === 'BigInt') return BigInt(value?.value ?? value);
  if (type === 'Decimal') return new Prisma.Decimal(value);
  if (type === 'Bytes') {
    if (typeof value === 'string') return Buffer.from(value, 'base64');
    if (value?.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  }
  return value;
}

function restoreRows(model, rows) {
  const scalarFields = new Map(model.fields.filter((field) => field.kind === 'scalar').map((field) => [field.name, field.type]));
  return rows.map((row) => Object.fromEntries(Object.entries(row)
    .filter(([key]) => scalarFields.has(key))
    .map(([key, value]) => [key, scalarValue(scalarFields.get(key), value)])));
}

function prismaCli(root) {
  return path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
}

function pushEmptySchema({ root, databaseUrl, directUrl }) {
  const result = spawnSync(process.execPath, [prismaCli(root), 'db', 'push', '--schema', path.join(root, 'prisma', 'schema.prisma'), '--skip-generate'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300_000,
  });
  if (result.status !== 0) throw new Error(`Prisma db push failed for rehearsal schema (exit ${result.status}).`);
}

async function foreignKeys(db, schema) {
  return db.$queryRawUnsafe(`
    SELECT c.conname AS name, r.relname AS table_name, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = $1 AND c.contype = 'f'
    ORDER BY r.relname, c.conname
  `, schema);
}

export async function rehearseRestore({ root, directUrl, payload, rehearsalSchema }) {
  if (!rehearsalSchema.startsWith(CEO_REHEARSAL_PREFIX) || !IDENTIFIER.test(rehearsalSchema)) {
    throw new Error('Unsafe rehearsal schema name.');
  }
  const admin = new PrismaClient({ datasources: { db: { url: withSchema(directUrl, payload.schema) } } });
  const rehearsalUrl = withSchema(directUrl, rehearsalSchema);
  let rehearsal = null;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA ${quoteIdentifier(rehearsalSchema)}`);
    pushEmptySchema({ root, databaseUrl: rehearsalUrl, directUrl: rehearsalUrl });
    rehearsal = new PrismaClient({ datasources: { db: { url: rehearsalUrl } } });
    const constraints = await foreignKeys(rehearsal, rehearsalSchema);
    for (const constraint of constraints) {
      await rehearsal.$executeRawUnsafe(
        `ALTER TABLE ${quoteIdentifier(rehearsalSchema)}.${quoteDatabaseIdentifier(constraint.table_name)} DROP CONSTRAINT ${quoteDatabaseIdentifier(constraint.name)}`,
      );
    }
    for (const model of Prisma.dmmf.datamodel.models) {
      const rows = payload.data[model.name];
      const delegate = delegateName(model.name);
      if (!Array.isArray(rows) || !rows.length || !rehearsal[delegate]) continue;
      await rehearsal[delegate].createMany({ data: restoreRows(model, rows), skipDuplicates: true });
    }
    for (const constraint of constraints) {
      await rehearsal.$executeRawUnsafe(
        `ALTER TABLE ${quoteIdentifier(rehearsalSchema)}.${quoteDatabaseIdentifier(constraint.table_name)} ADD CONSTRAINT ${quoteDatabaseIdentifier(constraint.name)} ${constraint.definition}`,
      );
    }
    const mismatches = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      if (!(model.name in payload.counts)) continue;
      const actual = await rehearsal[delegateName(model.name)].count();
      if (actual !== payload.counts[model.name]) mismatches.push({ model: model.name, expected: payload.counts[model.name], actual });
    }
    if (mismatches.length) throw new Error(`Restore rehearsal count mismatch in ${mismatches.length} models.`);
    return { schema: payload.schema, rehearsalSchema, tables: Object.keys(payload.counts).length, rows: Object.values(payload.counts).reduce((sum, value) => sum + value, 0), foreignKeys: constraints.length, verified: true };
  } finally {
    if (rehearsal) await rehearsal.$disconnect();
    try { await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(rehearsalSchema)} CASCADE`); } finally { await admin.$disconnect(); }
  }
}

export function writeBackup({ outputDirectory, backup, filename }) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const target = path.join(outputDirectory, filename);
  fs.writeFileSync(target, backup.encrypted, { flag: 'wx' });
  return { ...backup.summary, file: filename };
}

export function readAndVerifyBackup({ directory, entry, secret }) {
  const file = path.join(directory, entry.file);
  const encrypted = fs.readFileSync(file);
  if (sha256(encrypted) !== entry.encryptedSha256) throw new Error(`Checksum mismatch for ${entry.file}.`);
  const payload = decryptBackup(encrypted, secret);
  if (payload.schema !== entry.schema || payload.sourceGroup !== entry.sourceGroup) throw new Error(`Manifest mismatch for ${entry.file}.`);
  return payload;
}

export function fileSha256(file) {
  return sha256(fs.readFileSync(file));
}
