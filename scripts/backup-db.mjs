import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'plan';
const FORMAT = 'repositoryrealms-generic-json-v1';
const TOOL = 'repositoryrealms-backup-v2';
const CONSISTENCY = 'single-repeatable-read-read-only-transaction';
const PRODUCTION_SCHEMAS = ['public', 'egoric', 'vnecom', 'egolive'];

function fail(message) {
  throw new Error(message);
}

function repositorySafety() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  if (branch !== 'codex/realms-demo') fail(`Refusing backup from branch ${branch || '(detached)'}.`);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
  if (project.projectName !== 'crmegoric-realms-demo') fail(`Refusing Vercel project ${project.projectName || '(unknown)'}.`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeIdentifier(value, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) fail(`Unsafe PostgreSQL ${label}: ${value}.`);
  return `"${value}"`;
}

function schemas() {
  const values = String(process.env.BACKUP_SCHEMAS || PRODUCTION_SCHEMAS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.length || new Set(values).size !== values.length) fail('BACKUP_SCHEMAS must contain unique schema names.');
  for (const value of values) safeIdentifier(value, 'schema');
  return values;
}

function parseDatabaseUrl() {
  const raw = process.env.BACKUP_DATABASE_URL;
  if (!raw) fail('BACKUP_DATABASE_URL is required; this command never falls back to app runtime credentials.');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail('BACKUP_DATABASE_URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) fail('Backup requires PostgreSQL.');
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!database) fail('Backup URL must include a database name.');
  const redacted = `${parsed.protocol}//${parsed.host}/${database}`;
  return { database, parsed, raw, redacted };
}

function targetApproval(redacted, selectedSchemas) {
  const fingerprint = sha256(`${redacted}?schemas=${selectedSchemas.join(',')}`).slice(0, 12);
  return `backup-four-entity:${fingerprint}:${selectedSchemas.join(',')}`;
}

function assertTarget(database, selectedSchemas) {
  const source = String(process.env.BACKUP_SOURCE || '').trim().toLowerCase();
  if (!['production', 'staging', 'test'].includes(source)) fail('BACKUP_SOURCE must be production, staging or test.');
  if (source === 'production') {
    if (selectedSchemas.join(',') !== PRODUCTION_SCHEMAS.join(',')) {
      fail(`Production backup must use exactly ${PRODUCTION_SCHEMAS.join(',')}.`);
    }
  } else {
    assertFullStagingTarget({
      environment: source,
      databaseUrl: database.raw,
      protectedDatabaseUrls: [process.env.PROTECTED_PRODUCTION_DATABASE_URL, process.env.PROTECTED_PRODUCTION_DIRECT_URL],
      allowUnmarked: process.env.BACKUP_ALLOW_UNMARKED_NON_PRODUCTION === '1',
    });
  }
  const approval = targetApproval(database.redacted, selectedSchemas);
  if (command === 'create' && process.env.BACKUP_APPROVAL !== approval) fail('BACKUP_APPROVAL does not match the reviewed target fingerprint.');
  return { approval, source };
}

function stamp() {
  return new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace('T', '-').slice(0, 15);
}

function outputDirectory() {
  if (process.env.BACKUP_OUTPUT_DIR) return path.resolve(process.env.BACKUP_OUTPUT_DIR);
  const outputRoot = process.env.BACKUP_OUTPUT_ROOT ? path.resolve(process.env.BACKUP_OUTPUT_ROOT) : path.join(root, 'backups');
  return path.join(outputRoot, stamp());
}

function inputDirectory() {
  const value = process.argv[3] || process.env.BACKUP_INPUT_DIR;
  if (!value) fail('Provide an exact backup directory as BACKUP_INPUT_DIR or the first argument after verify.');
  return path.resolve(value);
}

function serialize(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return { $bigint: String(item) };
    return item;
  });
}

async function tableNames(client, schema) {
  const rows = await client.$queryRawUnsafe(
    `SELECT table_name AS "name"
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
    schema,
  );
  return rows.map((row) => String(row.name));
}

async function dumpSchema(client, schema, createdAt) {
  const schemaIdentifier = safeIdentifier(schema, 'schema');
  const tables = {};
  let rowCount = 0;
  for (const table of await tableNames(client, schema)) {
    const tableIdentifier = safeIdentifier(table, 'table');
    const rows = await client.$queryRawUnsafe(`SELECT * FROM ${schemaIdentifier}.${tableIdentifier}`);
    tables[table] = rows;
    rowCount += rows.length;
  }
  return {
    bytes: Buffer.from(serialize({ schema, createdAt, tables }), 'utf8'),
    rowCount,
    tableCount: Object.keys(tables).length,
  };
}

async function createBackup(database, selectedSchemas, source) {
  const directory = outputDirectory();
  if (fs.existsSync(directory) && fs.readdirSync(directory).length) fail('BACKUP_OUTPUT_DIR already exists and is not empty.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const createdAt = new Date().toISOString();
  const manifest = {
    createdAt,
    source,
    format: FORMAT,
    tool: TOOL,
    database: database.redacted,
    consistency: CONSISTENCY,
    schemas: {},
  };
  const client = new PrismaClient({ datasources: { db: { url: database.raw } } });
  try {
    const snapshots = [];
    await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      for (const schema of selectedSchemas) {
        snapshots.push({ schema, snapshot: await dumpSchema(transaction, schema, createdAt) });
      }
    }, { isolationLevel: 'RepeatableRead', maxWait: 30_000, timeout: 300_000 });

    for (const { schema, snapshot } of snapshots) {
      const file = `${schema}.json`;
      fs.writeFileSync(path.join(directory, file), snapshot.bytes, { mode: 0o600, flag: 'wx' });
      manifest.schemas[schema] = {
        tables: snapshot.tableCount,
        rows: snapshot.rowCount,
        file,
        sha256: sha256(snapshot.bytes),
      };
      console.log(`Backup ${schema}: ${snapshot.tableCount} tables, ${snapshot.rowCount} rows.`);
    }
  } catch (error) {
    fs.writeFileSync(path.join(directory, 'INCOMPLETE.txt'), `${new Date().toISOString()} backup failed; do not use this directory.\n`, { mode: 0o600 });
    throw error;
  } finally {
    await client.$disconnect();
  }
  fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(`Backup completed: ${directory}`);
  return directory;
}

function verifyBackup(directory) {
  const manifestPath = path.join(directory, 'manifest.json');
  if (!fs.existsSync(manifestPath) || fs.existsSync(path.join(directory, 'INCOMPLETE.txt'))) fail('Backup is missing a valid completed manifest.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== FORMAT
    || manifest.tool !== TOOL
    || manifest.consistency !== CONSISTENCY
    || !['production', 'staging', 'test'].includes(manifest.source)
    || typeof manifest.database !== 'string'
    || manifest.database.includes('@')
    || !manifest.schemas
    || typeof manifest.schemas !== 'object') {
    fail('Unsupported or incomplete backup manifest.');
  }
  const schemaNames = Object.keys(manifest.schemas);
  if (!schemaNames.length) fail('Backup manifest contains no schemas.');
  if (manifest.source === 'production' && schemaNames.join(',') !== PRODUCTION_SCHEMAS.join(',')) {
    fail(`Production backup must contain exactly ${PRODUCTION_SCHEMAS.join(',')}.`);
  }
  let totalRows = 0;
  for (const [schema, entry] of Object.entries(manifest.schemas)) {
    safeIdentifier(schema, 'schema');
    if (entry.file !== `${schema}.json` || path.basename(entry.file) !== entry.file) fail(`Unsafe backup file for ${schema}.`);
    if (!Number.isSafeInteger(entry.tables) || entry.tables < 0
      || !Number.isSafeInteger(entry.rows) || entry.rows < 0
      || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
      fail(`Invalid backup metadata for ${schema}.`);
    }
    const file = path.join(directory, entry.file);
    if (!fs.existsSync(file)) fail(`Backup file is missing for ${schema}.`);
    const bytes = fs.readFileSync(file);
    if (sha256(bytes) !== entry.sha256) fail(`Backup checksum mismatch for ${schema}.`);
    const payload = JSON.parse(bytes.toString('utf8'));
    if (payload.schema !== schema
      || payload.createdAt !== manifest.createdAt
      || !payload.tables
      || typeof payload.tables !== 'object'
      || Array.isArray(payload.tables)) {
      fail(`Invalid backup payload for ${schema}.`);
    }
    const names = Object.keys(payload.tables);
    if (names.includes('_prisma_migrations')
      || names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || !Array.isArray(payload.tables[name]))) {
      fail(`Invalid table rows for ${schema}.`);
    }
    const rows = names.reduce((sum, name) => sum + payload.tables[name].length, 0);
    if (names.length !== entry.tables || rows !== entry.rows) fail(`Backup count mismatch for ${schema}.`);
    totalRows += rows;
  }
  console.log(`Backup verified: ${Object.keys(manifest.schemas).length} schemas, ${totalRows} rows, all checksums valid.`);
  return manifest;
}

async function main() {
  if (!['plan', 'create', 'verify'].includes(command)) fail('Use plan, create or verify.');
  repositorySafety();
  if (command === 'verify') {
    verifyBackup(inputDirectory());
    return;
  }
  const database = parseDatabaseUrl();
  const selectedSchemas = schemas();
  const target = assertTarget(database, selectedSchemas);
  console.log(`Backup source: ${target.source}`);
  console.log(`Target: ${database.redacted}`);
  console.log(`Schemas: ${selectedSchemas.join(', ')}`);
  console.log(`Required approval: ${target.approval}`);
  if (command === 'plan') return;
  const directory = await createBackup(database, selectedSchemas, target.source);
  verifyBackup(directory);
}

main().catch((error) => {
  console.error(`[database-backup] ${String(error?.message || error).trim()}`);
  process.exitCode = 1;
});
