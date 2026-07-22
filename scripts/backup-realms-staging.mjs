import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Prisma, PrismaClient } from '@prisma/client';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'create';

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

function backupLocation() {
  if (process.env.REALMS_STAGING_BACKUP_PATH) return path.resolve(process.env.REALMS_STAGING_BACKUP_PATH);
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return path.join(os.tmpdir(), 'crmegoric-realms-staging-backups', stamp, 'snapshot.json.gz');
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
    rows += records.length;
  }
  if (rows !== manifest.rowCount || Object.keys(payload.models || {}).length !== manifest.modelCount) fail('Backup manifest count mismatch.');

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

async function main() {
  if (!['create', 'verify'].includes(command)) fail('Use create or verify.');
  repositorySafety();
  const resolved = target();
  const databaseUrl = process.env.REALMS_STAGING_DATABASE_URL;
  if (command === 'create') await createBackup(databaseUrl, resolved);
  else await verifyBackup(databaseUrl);
}

main().catch((error) => {
  console.error(`[staging-backup] ${error.message}`);
  process.exitCode = 1;
});
