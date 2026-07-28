import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Prisma, PrismaClient } from '@prisma/client';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'create';
const RESTORE_REHEARSAL_CONFIRMATION = 'CREATE_AND_DROP_ISOLATED_RESTORE_TEST_SCHEMA';
const RESTORE_SCHEMA_PREFIX = 'restore_test_';
const ENTITY_SCHEMAS = ['public', 'egoric', 'vnecom', 'egolive'];

function fail(message) {
  throw new Error(message);
}

function repositorySafety() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  if (branch !== 'codex/realms-demo') fail(`Refusing staging backup from branch ${branch || '(detached)'}.`);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
  if (project.projectName !== 'crmegoric-realms-demo') fail(`Refusing Vercel project ${project.projectName || '(unknown)'}.`);
  return { branch, project: project.projectName };
}

function target() {
  const resolved = assertFullStagingTarget({
    environment: process.env.REALMS_DEPLOY_ENV,
    databaseUrl: process.env.REALMS_STAGING_DATABASE_URL,
    protectedDatabaseUrls: [process.env.PROTECTED_PRODUCTION_DATABASE_URL, process.env.PROTECTED_PRODUCTION_DIRECT_URL],
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1',
  });
  if (process.env.REALMS_STAGING_APPROVAL !== resolved.approval) fail('REALMS_STAGING_APPROVAL does not match the staging target.');
  return resolved;
}

function delegateName(modelName) {
  return `${modelName[0].toLowerCase()}${modelName.slice(1)}`;
}

function json(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? { $bigint: String(item) } : item);
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function databaseUrlWithSchema(databaseUrl, schema) {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.set('schema', schema);
  return parsed.toString();
}

function connectionHostFamily(host) {
  return String(host || '').toLowerCase().replace('-pooler.', '.');
}

function stagingDirectUrl(databaseUrl, resolvedTarget) {
  const directUrl = process.env.REALMS_STAGING_DIRECT_URL || databaseUrl;
  const directTarget = assertFullStagingTarget({
    environment: process.env.REALMS_DEPLOY_ENV,
    databaseUrl: directUrl,
    protectedDatabaseUrls: [
      process.env.DATABASE_URL,
      process.env.DIRECT_URL,
      process.env.PROTECTED_PRODUCTION_DATABASE_URL,
      process.env.PROTECTED_PRODUCTION_DIRECT_URL,
    ],
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1',
  });
  if (directTarget.database !== resolvedTarget.database
    || directTarget.schema !== resolvedTarget.schema
    || connectionHostFamily(directTarget.host) !== connectionHostFamily(resolvedTarget.host)) {
    fail('REALMS_STAGING_DIRECT_URL does not match the approved staging target.');
  }
  return directUrl;
}

function safeRestoreSchemaName(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `${RESTORE_SCHEMA_PREFIX}${day}_${randomBytes(4).toString('hex')}`;
}

function assertRestoreSchemaName(schema) {
  if (!new RegExp(`^${RESTORE_SCHEMA_PREFIX}[0-9]{8}_[a-f0-9]{8}$`).test(schema)) {
    fail('Refusing an unsafe restore rehearsal schema name.');
  }
  return schema;
}

function backupLocation() {
  if (process.env.REALMS_STAGING_BACKUP_PATH) return path.resolve(process.env.REALMS_STAGING_BACKUP_PATH);
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return path.join(os.tmpdir(), 'crmegoric-realms-staging-backups', stamp, 'snapshot.json.gz');
}

function readAndValidateBackup() {
  const input = backupLocation();
  if (!fs.existsSync(input) || !fs.existsSync(`${input}.manifest.json`)) fail('Backup archive or manifest is missing.');
  const archive = fs.readFileSync(input);
  const manifest = JSON.parse(fs.readFileSync(`${input}.manifest.json`, 'utf8'));
  if (digest(archive) !== manifest.sha256) fail('Backup checksum mismatch.');
  const payload = JSON.parse(gunzipSync(archive).toString('utf8'));
  if (payload.format !== 'crmegoric-realms-staging-json-v1') fail('Unsupported backup format.');

  const modelMap = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  let rows = 0;
  for (const [name, records] of Object.entries(payload.models || {})) {
    const model = modelMap.get(name);
    if (!model || !Array.isArray(records)) fail(`Invalid model payload for ${name}.`);
    const idFields = model.primaryKey?.fields?.length
      ? model.primaryKey.fields
      : model.fields.filter((field) => field.isId).map((field) => field.name);
    if (idFields.length) {
      const identities = new Set(records.map((record) => idFields.map((field) => json(record[field])).join('|')));
      if (identities.size !== records.length) fail(`Duplicate primary identity found in ${name}.`);
    }
    if (manifest.counts?.[name] !== records.length) fail(`Backup manifest model count mismatch for ${name}.`);
    rows += records.length;
  }
  if (rows !== manifest.rowCount
    || Object.keys(payload.models || {}).length !== manifest.modelCount
    || Object.keys(manifest.counts || {}).length !== manifest.modelCount) {
    fail('Backup manifest count mismatch.');
  }
  return { input, manifest, modelMap, payload };
}

function readLegacyBackupDirectory(directory) {
  const inputDirectory = path.resolve(directory || '');
  const manifestPath = path.join(inputDirectory, 'manifest.json');
  if (!directory || !fs.existsSync(manifestPath)) fail('Legacy backup manifest is missing.');
  const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (sourceManifest.format !== 'repositoryrealms-generic-json-v1') fail('Unsupported legacy backup format.');
  const modelMap = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));

  return ENTITY_SCHEMAS.map((schema) => {
    const entry = sourceManifest.schemas?.[schema];
    if (!entry || path.basename(entry.file || '') !== entry.file) fail(`Missing or unsafe legacy backup entry for ${schema}.`);
    const input = path.join(inputDirectory, entry.file);
    if (!fs.existsSync(input)) fail(`Legacy backup file is missing for ${schema}.`);
    const bytes = fs.readFileSync(input);
    if (digest(bytes) !== entry.sha256) fail(`Legacy backup checksum mismatch for ${schema}.`);
    const source = JSON.parse(bytes.toString('utf8'));
    if (source.schema !== schema || !source.tables || typeof source.tables !== 'object') fail(`Invalid legacy payload for ${schema}.`);
    for (const name of Object.keys(source.tables)) {
      if (!modelMap.has(name) || !Array.isArray(source.tables[name])) fail(`Invalid legacy model payload for ${schema}.${name}.`);
    }
    const models = Object.fromEntries([...modelMap.keys()].map((name) => [name, source.tables[name] || []]));
    const counts = Object.fromEntries(Object.entries(models).map(([name, records]) => [name, records.length]));
    const rowCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (rowCount !== entry.rows || Object.keys(source.tables).length !== entry.tables) fail(`Legacy manifest count mismatch for ${schema}.`);
    return {
      input,
      evidencePath: `${input}.restore-test.json`,
      manifest: {
        format: sourceManifest.format,
        createdAt: source.createdAt || sourceManifest.createdAt,
        sha256: entry.sha256,
        modelCount: modelMap.size,
        rowCount,
        counts,
        target: `legacy-production-backup:${schema}`,
      },
      modelMap,
      payload: {
        format: sourceManifest.format,
        createdAt: source.createdAt || sourceManifest.createdAt,
        modelCount: modelMap.size,
        models,
      },
      schema,
    };
  });
}

function restoreOrder(modelMap, payload) {
  const names = new Set(Object.keys(payload.models || {}));
  const dependencies = new Map();
  for (const name of names) {
    const model = modelMap.get(name);
    const records = payload.models[name];
    const deps = new Set(
      model.fields
        .filter((field) => field.kind === 'object'
          && field.relationFromFields?.length
          && names.has(field.type)
          && field.type !== name
          && records.some((record) => field.relationFromFields.some((foreignKey) => record[foreignKey] !== null && record[foreignKey] !== undefined)))
        .map((field) => field.type),
    );
    dependencies.set(name, deps);
  }

  const ordered = [];
  const remaining = new Set(names);
  while (remaining.size) {
    const ready = [...remaining].filter((name) => [...dependencies.get(name)].every((dependency) => !remaining.has(dependency))).sort();
    if (!ready.length) {
      fail(`Cyclic required relation prevents deterministic restore: ${[...remaining].sort().join(', ')}.`);
    }
    for (const name of ready) {
      ordered.push(name);
      remaining.delete(name);
    }
  }
  return ordered;
}

function restoreScalar(field, value) {
  if (field.type === 'Json' && value === null) return Prisma.DbNull;
  if (value === null || value === undefined) return value;
  if (field.type === 'DateTime') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) fail(`Invalid DateTime value for ${field.name}.`);
    return date;
  }
  if (field.type === 'BigInt') return BigInt(value?.$bigint ?? value);
  if (field.type === 'Decimal') return new Prisma.Decimal(value);
  if (field.type === 'Bytes') {
    if (value?.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
    if (typeof value === 'string') return Buffer.from(value, 'base64');
    fail(`Invalid Bytes value for ${field.name}.`);
  }
  return value;
}

function restoreRecord(model, record) {
  const scalarFields = new Map(model.fields.filter((field) => field.kind !== 'object').map((field) => [field.name, field]));
  return Object.fromEntries(Object.entries(record).map(([name, value]) => {
    const field = scalarFields.get(name);
    if (!field) fail(`Unknown restore field ${model.name}.${name}.`);
    if (field.isList && Array.isArray(value)) return [name, value.map((item) => restoreScalar(field, item))];
    return [name, restoreScalar(field, value)];
  }));
}

function identityDigest(model, records) {
  const idFields = model.primaryKey?.fields?.length
    ? model.primaryKey.fields
    : model.fields.filter((field) => field.isId).map((field) => field.name);
  if (!idFields.length) return null;
  const identities = records
    .map((record) => idFields.map((field) => json(record[field])).join('|'))
    .sort();
  return digest(Buffer.from(JSON.stringify(identities), 'utf8'));
}

async function createBackup(databaseUrl, resolvedTarget) {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const models = {};
  try {
    for (const model of Prisma.dmmf.datamodel.models) {
      const delegate = client[delegateName(model.name)];
      if (!delegate?.findMany) fail(`Prisma delegate missing for ${model.name}.`);
      models[model.name] = await delegate.findMany();
    }
  } finally {
    await client.$disconnect();
  }

  const payload = {
    format: 'crmegoric-realms-staging-json-v1',
    createdAt: new Date().toISOString(),
    target: { host: resolvedTarget.host, database: resolvedTarget.database, schema: resolvedTarget.schema },
    modelCount: Object.keys(models).length,
    models,
  };
  const archive = gzipSync(Buffer.from(json(payload), 'utf8'), { level: 9 });
  const output = backupLocation();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, archive, { mode: 0o600 });
  const manifest = {
    format: payload.format,
    createdAt: payload.createdAt,
    archive: path.basename(output),
    sha256: digest(archive),
    bytes: archive.length,
    modelCount: payload.modelCount,
    rowCount: Object.values(models).reduce((sum, rows) => sum + rows.length, 0),
    counts: Object.fromEntries(Object.entries(models).map(([name, rows]) => [name, rows.length])),
    target: resolvedTarget.redactedUrl,
    restorePolicy: 'Verify into a new isolated staging target; never overwrite the source database.',
  };
  fs.writeFileSync(`${output}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`Staging backup created: ${output}`);
  console.log(`Snapshot: ${manifest.modelCount} models, ${manifest.rowCount} rows, SHA-256 ${manifest.sha256.slice(0, 16)}...`);
  return output;
}

async function verifyBackup(databaseUrl) {
  const { manifest } = readAndValidateBackup();

  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const drift = [];
  try {
    for (const [name, expected] of Object.entries(manifest.counts)) {
      const actual = await client[delegateName(name)].count();
      if (actual !== expected) drift.push({ model: name, expected, actual });
    }
  } finally {
    await client.$disconnect();
  }
  if (drift.length && process.env.REALMS_STAGING_BACKUP_ALLOW_LIVE_DRIFT !== '1') {
    fail(`Live staging changed after backup (${drift.length} model count differences).`);
  }
  console.log(`Restore-readiness simulation passed: checksum, decompression, ${manifest.modelCount} model shapes, primary identities and ${manifest.rowCount} rows verified.`);
  console.log(`Live count drift: ${drift.length} model(s).`);
}

function pushSchema(databaseUrl) {
  const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
  if (!fs.existsSync(prismaCli)) fail('Prisma CLI is missing; run npm ci before restore rehearsal.');
  const result = spawnSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
  });
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout || ''}`.trim().split(/\r?\n/).slice(-8).join('\n');
    fail(`Could not provision isolated restore schema.${detail ? `\n${detail}` : ''}`);
  }
}

async function rehearseSnapshot(databaseUrl, resolvedTarget, backup) {
  const { input, manifest, modelMap, payload } = backup;
  const schema = assertRestoreSchemaName(safeRestoreSchemaName());
  if (schema === resolvedTarget.schema) fail('Restore rehearsal schema must differ from the backup source schema.');

  const adminUrl = stagingDirectUrl(databaseUrl, resolvedTarget);
  const rehearsalUrl = databaseUrlWithSchema(adminUrl, schema);
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  let created = false;
  let passed = false;
  let restoredRows = 0;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    pushSchema(rehearsalUrl);

    const restore = new PrismaClient({ datasources: { db: { url: rehearsalUrl } } });
    try {
      for (const name of restoreOrder(modelMap, payload)) {
        const records = payload.models[name];
        if (!records.length) continue;
        const model = modelMap.get(name);
        const result = await restore[delegateName(name)].createMany({
          data: records.map((record) => restoreRecord(model, record)),
          skipDuplicates: true,
        });
        if (result.count !== records.length) fail(`Restore count mismatch while writing ${name}.`);
        restoredRows += result.count;
      }

      for (const [name, expected] of Object.entries(manifest.counts)) {
        const model = modelMap.get(name);
        const delegate = restore[delegateName(name)];
        const actual = await delegate.count();
        if (actual !== expected) fail(`Restored count mismatch for ${name}: expected ${expected}, received ${actual}.`);
        const idFields = model.primaryKey?.fields?.length
          ? model.primaryKey.fields
          : model.fields.filter((field) => field.isId).map((field) => field.name);
        if (idFields.length && expected > 0) {
          const select = Object.fromEntries(idFields.map((field) => [field, true]));
          const identities = await delegate.findMany({ select });
          const sourceDigest = identityDigest(model, payload.models[name]);
          const restoredDigest = identityDigest(model, identities);
          if (sourceDigest !== restoredDigest) fail(`Restored identity mismatch for ${name}.`);
        }
      }
      passed = true;
    } finally {
      await restore.$disconnect();
    }
  } finally {
    try {
      if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.$disconnect();
    }
  }

  if (!passed) fail('Restore rehearsal did not complete.');
  const evidence = {
    format: 'crmegoric-realms-staging-restore-rehearsal-v1',
    completedAt: new Date().toISOString(),
    archive: path.basename(input),
    archiveSha256: manifest.sha256,
    sourceTarget: manifest.target,
    isolatedTarget: `${resolvedTarget.host}/${resolvedTarget.database}?schema=${schema}`,
    modelCount: manifest.modelCount,
    rowCount: restoredRows,
    checks: ['archive_sha256', 'manifest_counts', 'model_shapes', 'primary_identities', 'isolated_restore_counts'],
    cleanup: { schema, dropped: true },
  };
  fs.writeFileSync(backup.evidencePath || `${input}.restore-test.json`, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Isolated restore rehearsal passed: ${manifest.modelCount} models, ${restoredRows} rows, schema ${schema} created and dropped.`);
}

function assertRestoreRehearsalConfirmation() {
  if (process.env.REALMS_STAGING_RESTORE_CONFIRMATION !== RESTORE_REHEARSAL_CONFIRMATION) {
    fail(`Restore rehearsal requires REALMS_STAGING_RESTORE_CONFIRMATION=${RESTORE_REHEARSAL_CONFIRMATION}.`);
  }
}

async function rehearseRestore(databaseUrl, resolvedTarget) {
  assertRestoreRehearsalConfirmation();
  await rehearseSnapshot(databaseUrl, resolvedTarget, readAndValidateBackup());
}

async function rehearseLegacyRestore(databaseUrl, resolvedTarget) {
  assertRestoreRehearsalConfirmation();
  const backups = readLegacyBackupDirectory(process.env.REALMS_STAGING_LEGACY_BACKUP_DIR);
  for (const backup of backups) {
    console.log(`Rehearsing verified legacy backup for ${backup.schema}.`);
    await rehearseSnapshot(databaseUrl, resolvedTarget, backup);
  }
}

async function main() {
  if (!['create', 'verify', 'rehearse', 'rehearse-legacy'].includes(command)) fail('Use create, verify, rehearse or rehearse-legacy.');
  repositorySafety();
  const resolved = target();
  const databaseUrl = process.env.REALMS_STAGING_DATABASE_URL;
  if (command === 'create') await createBackup(databaseUrl, resolved);
  else if (command === 'verify') await verifyBackup(databaseUrl);
  else if (command === 'rehearse') await rehearseRestore(databaseUrl, resolved);
  else await rehearseLegacyRestore(databaseUrl, resolved);
}

main().catch((error) => {
  console.error(`[staging-backup] ${error.message}`);
  process.exitCode = 1;
});
