import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  StagingCloneError,
  assertFullStagingTarget,
  assertStagingMigrationApproval,
} from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const migrationsPath = path.join(root, 'prisma', 'migrations');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'prisma', 'realm-phase12-manifest.json'), 'utf8'));
const commands = new Set(['plan', 'baseline', 'deploy', 'verify']);
const essentialTables = [
  'User', 'Task', 'Client', 'Project', 'Approval',
  'RealmProfile', 'RealmGoldEntry',
  'CollaborationPresenceSession', 'CollaborationContactRequest',
];

function migrationNames() {
  return fs.readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function resolveTarget(required) {
  const databaseUrl = process.env.REALMS_STAGING_DATABASE_URL;
  if (!databaseUrl && !required) return null;
  return assertFullStagingTarget({
    environment: process.env.REALMS_DEPLOY_ENV,
    databaseUrl,
    protectedDatabaseUrls: [
      process.env.DATABASE_URL,
      process.env.DIRECT_URL,
      process.env.PROTECTED_PRODUCTION_DATABASE_URL,
      process.env.PROTECTED_PRODUCTION_DIRECT_URL,
    ],
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1',
  });
}

function prismaResult(args, databaseUrl, { inherit = false } = {}) {
  const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
  return spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    encoding: inherit ? undefined : 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    shell: false,
  });
}

function runPrisma(args, databaseUrl) {
  const result = prismaResult(args, databaseUrl, { inherit: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new StagingCloneError('prisma_command_failed', `Prisma exited with status ${result.status}.`);
  }
}

function inspectDrift(databaseUrl) {
  const result = prismaResult([
    'migrate', 'diff',
    '--from-schema-datasource', schemaPath,
    '--to-schema-datamodel', schemaPath,
    '--script', '--exit-code',
  ], databaseUrl);
  if (result.error) throw result.error;
  if (result.status === 0) return { clean: true, sql: '' };
  if (result.status === 2) return { clean: false, sql: String(result.stdout || '').trim() };
  const detail = String(result.stderr || result.stdout || '').trim().slice(0, 800);
  throw new StagingCloneError('schema_diff_failed', detail || `Prisma diff exited with status ${result.status}.`);
}

function assertNoDrift(databaseUrl) {
  const drift = inspectDrift(databaseUrl);
  if (!drift.clean) {
    throw new StagingCloneError(
      'schema_drift_detected',
      `Staging differs from prisma/schema.prisma. Review this read-only diff before continuing:\n${drift.sql.slice(0, 1200)}`,
    );
  }
}

function safeSchemaIdentifier(schema) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new StagingCloneError('unsafe_schema_name', 'The staging schema name is not a safe PostgreSQL identifier.');
  }
  return `"${schema}"`;
}

async function inspectDatabase(databaseUrl, target) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const tableRows = await prisma.$queryRawUnsafe(
      'SELECT table_name AS "name" FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
      target.schema,
    );
    const tableNames = tableRows.map((row) => row.name);
    let migrationRows = [];
    if (tableNames.includes('_prisma_migrations')) {
      const schema = safeSchemaIdentifier(target.schema);
      migrationRows = await prisma.$queryRawUnsafe(
        `SELECT migration_name AS "name", finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt", logs
         FROM ${schema}."_prisma_migrations" ORDER BY started_at`,
      );
    }
    return { tableNames, migrationRows };
  } finally {
    await prisma.$disconnect();
  }
}

function completedMigrationNames(rows) {
  return new Set(rows.filter((row) => row.finishedAt && !row.rolledBackAt).map((row) => row.name));
}

function assertMigrationRecordsHealthy(rows) {
  const failed = rows.filter((row) => !row.finishedAt && !row.rolledBackAt);
  if (failed.length) {
    throw new StagingCloneError(
      'failed_migration_detected',
      `Staging contains unfinished migrations: ${failed.map((row) => row.name).join(', ')}.`,
    );
  }
}

function assertTablesComplete(tableNames) {
  const present = new Set(tableNames);
  const expected = Prisma.dmmf.datamodel.models.map((model) => model.dbName || model.name);
  const missing = expected.filter((table) => !present.has(table));
  const missingEssential = essentialTables.filter((table) => !present.has(table));
  if (missing.length || missingEssential.length) {
    throw new StagingCloneError(
      'schema_verification_failed',
      `Missing Prisma tables: ${[...new Set([...missingEssential, ...missing])].join(', ')}.`,
    );
  }
  return expected.length;
}

async function verify(databaseUrl, target) {
  assertNoDrift(databaseUrl);
  const state = await inspectDatabase(databaseUrl, target);
  assertMigrationRecordsHealthy(state.migrationRows);
  const completed = completedMigrationNames(state.migrationRows);
  const pending = migrationNames().filter((name) => !completed.has(name));
  if (pending.length) {
    throw new StagingCloneError('pending_migrations', `Pending staging migrations: ${pending.join(', ')}.`);
  }
  const tableCount = assertTablesComplete(state.tableNames);
  console.log(`Migration verification passed: ${completed.size} migrations, ${tableCount} Prisma tables, zero schema drift.`);
}

function printPlan(target) {
  console.log('Realms staging migration gate');
  console.log(`Migration chain: ${migrationNames().join(' → ')}`);
  console.log(`Baseline: ${manifest.baselineName}`);
  console.log('Policy: existing staging must match Prisma exactly before its baseline can be recorded.');
  console.log('Production URLs and environments are rejected; plan and verify are read-only.');
  if (target) {
    console.log(`Target: ${target.redactedUrl}`);
    console.log(`Environment: ${target.environment}`);
    console.log(`Required approval: ${target.approval}`);
  } else {
    console.log('Target: not configured (set REALMS_STAGING_DATABASE_URL to inspect staging).');
  }
}

async function main() {
  const command = process.argv[2] || 'plan';
  const commit = process.argv.includes('--commit');
  if (!commands.has(command)) {
    throw new StagingCloneError('unknown_command', `Unknown command ${command}. Use plan, baseline, deploy, or verify.`);
  }
  const target = resolveTarget(command !== 'plan');
  printPlan(target);
  if (!target) return;

  const databaseUrl = process.env.REALMS_STAGING_DATABASE_URL;
  if (command === 'plan') {
    const drift = inspectDrift(databaseUrl);
    const state = await inspectDatabase(databaseUrl, target);
    const completed = completedMigrationNames(state.migrationRows);
    const pending = migrationNames().filter((name) => !completed.has(name));
    console.log(`Schema drift: ${drift.clean ? 'none' : 'detected'}`);
    console.log(`Recorded migrations: ${completed.size || 'none'}`);
    console.log(`Pending migrations: ${pending.length ? pending.join(', ') : 'none'}`);
    return;
  }

  if (process.env.REALMS_STAGING_APPROVAL !== target.approval) {
    throw new StagingCloneError('approval_mismatch', 'Read-only verification requires the exact staging target approval token.');
  }
  if (command === 'verify') {
    await verify(databaseUrl, target);
    return;
  }

  if (!commit) {
    console.log(`Dry-run complete: ${command} did not change migration state. Add --commit and the dedicated confirmation token.`);
    return;
  }
  assertStagingMigrationApproval({
    command,
    commit,
    approval: process.env.REALMS_STAGING_APPROVAL,
    expectedApproval: target.approval,
    confirmation: process.env.REALMS_STAGING_MIGRATION_CONFIRM,
  });

  if (command === 'baseline') {
    assertNoDrift(databaseUrl);
    const state = await inspectDatabase(databaseUrl, target);
    assertMigrationRecordsHealthy(state.migrationRows);
    assertTablesComplete(state.tableNames);
    const completed = completedMigrationNames(state.migrationRows);
    if (completed.has(manifest.baselineName)) {
      console.log(`Baseline ${manifest.baselineName} is already recorded; no change required.`);
      return;
    }
    if (completed.size) {
      throw new StagingCloneError(
        'unexpected_migration_history',
        `Cannot baseline over existing migration history: ${[...completed].join(', ')}.`,
      );
    }
    runPrisma(['migrate', 'resolve', '--applied', manifest.baselineName, '--schema', schemaPath], databaseUrl);
    console.log(`Recorded existing staging schema as ${manifest.baselineName}. No business table was changed.`);
    return;
  }

  const before = await inspectDatabase(databaseUrl, target);
  const completedBefore = completedMigrationNames(before.migrationRows);
  const applicationTables = before.tableNames.filter((name) => name !== '_prisma_migrations');
  if (applicationTables.length && !completedBefore.has(manifest.baselineName)) {
    throw new StagingCloneError(
      'baseline_required',
      `Existing staging contains ${applicationTables.length} tables but has no recorded baseline. Run baseline first.`,
    );
  }
  runPrisma(['migrate', 'deploy', '--schema', schemaPath], databaseUrl);
  await verify(databaseUrl, target);
}

main().catch((error) => {
  const prefix = error instanceof StagingCloneError ? `[${error.code}]` : '[unexpected_error]';
  console.error(`${prefix} ${error.message}`);
  process.exitCode = 1;
});
