import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  REALM_PHASE12_MIGRATION,
  RealmDeploymentError,
  assertLegacyRealmRollbackCompatible,
  assertRealmMutationApproval,
  assertRealmStagingTarget,
  sha256Text,
} from "../lib/realm-deployment.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "prisma", "realm-phase12-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const migrationPath = path.join(root, "prisma", "migrations", manifest.migrationName, "migration.sql");
const rollbackPath = path.join(root, "prisma", "realm-rollbacks", `${manifest.migrationName}.down.sql`);
const commands = new Set(["plan", "apply", "verify", "rollback"]);

function validatePackage() {
  if (manifest.migrationName !== REALM_PHASE12_MIGRATION) {
    throw new RealmDeploymentError("manifest_name_mismatch", "Phase 12 manifest points to an unexpected migration.");
  }
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  const rollbackSql = fs.readFileSync(rollbackPath, "utf8");
  if (sha256Text(migrationSql) !== manifest.migrationSha256) {
    throw new RealmDeploymentError("migration_checksum_mismatch", "Forward migration checksum does not match the manifest.");
  }
  if (sha256Text(rollbackSql) !== manifest.rollbackSha256) {
    throw new RealmDeploymentError("rollback_checksum_mismatch", "Rollback checksum does not match the manifest.");
  }
}

function printPackagePlan(target) {
  console.log(`Realm Phase ${manifest.phase} staging gate`);
  console.log(`Migration: ${manifest.migrationName}`);
  console.log(`Creates: ${manifest.additiveTables.join(", ")}`);
  console.log(`Requires: ${manifest.requiredExistingTables.join(", ")}`);
  console.log("Default mode: dry-run; DATABASE_URL and .env are never used as fallback.");
  if (target) {
    console.log(`Target: ${target.redactedUrl}`);
    console.log(`Environment: ${target.environment}`);
    console.log(`Required approval: ${target.approval}`);
  } else {
    console.log("Target: not configured (set REALM_STAGING_DATABASE_URL to validate one). ");
  }
}

function resolveTarget(required) {
  const databaseUrl = process.env.REALM_STAGING_DATABASE_URL;
  if (!databaseUrl && !required) return null;
  return assertRealmStagingTarget({
    environment: process.env.REALM_DEPLOY_ENV,
    databaseUrl,
    expectedSchema: process.env.REALM_STAGING_SCHEMA,
    allowPublic: process.env.REALM_STAGING_ALLOW_PUBLIC === "1",
    allowUnmarked: process.env.REALM_STAGING_ALLOW_UNMARKED_TARGET === "1",
  });
}

function runPrisma(args, databaseUrl) {
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new RealmDeploymentError("prisma_command_failed", `Prisma exited with status ${result.status}.`);
  }
}

async function inspectStructure(databaseUrl, target) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const placeholders = manifest.additiveTables.map((_, index) => `$${index + 2}`).join(", ");
  const args = [target.schema, ...manifest.additiveTables];
  try {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT table_name AS "name" FROM information_schema.tables WHERE table_schema = $1 AND table_name IN (${placeholders}) ORDER BY table_name`,
      ...args,
    );
    const indexes = await prisma.$queryRawUnsafe(
      `SELECT indexname AS "name" FROM pg_indexes WHERE schemaname = $1 AND tablename IN (${placeholders}) ORDER BY indexname`,
      ...args,
    );
    const constraints = await prisma.$queryRawUnsafe(
      `SELECT c.conname AS "name", c.contype AS "type"
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = $1 AND t.relname IN (${placeholders}) AND c.contype IN ('f', 'c')
       ORDER BY c.conname`,
      ...args,
    );
    return {
      tables: tables.map((row) => row.name),
      indexes: indexes.map((row) => row.name),
      foreignKeys: constraints.filter((row) => row.type === "f").map((row) => row.name),
      checks: constraints.filter((row) => row.type === "c").map((row) => row.name),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function hasAppliedMigration(databaseUrl, migrationName) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const [history] = await prisma.$queryRaw`
      SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS "exists"
    `;
    if (!history?.exists) return false;
    const [row] = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = ${migrationName}
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      ) AS "applied"
    `;
    return Boolean(row?.applied);
  } finally {
    await prisma.$disconnect();
  }
}

function missing(expected, actual) {
  const found = new Set(actual);
  return expected.filter((item) => !found.has(item));
}

async function verifyStructure(databaseUrl, target, expectPresent) {
  const result = await inspectStructure(databaseUrl, target);
  if (!expectPresent) {
    if (result.tables.length) {
      throw new RealmDeploymentError("rollback_incomplete", `Realm tables still present: ${result.tables.join(", ")}`);
    }
    console.log("Rollback verification passed: no Phase 12 Realm table remains.");
    return;
  }

  const missingItems = [
    ...missing(manifest.additiveTables, result.tables),
    ...missing(manifest.requiredIndexes, result.indexes),
    ...missing(manifest.requiredForeignKeys, result.foreignKeys),
    ...missing(manifest.requiredChecks, result.checks),
  ];
  if (missingItems.length) {
    throw new RealmDeploymentError("schema_verification_failed", `Missing schema objects: ${missingItems.join(", ")}`);
  }
  console.log(
    `Schema verification passed: ${result.tables.length} tables, ${result.indexes.length} indexes, ` +
      `${result.foreignKeys.length} foreign keys, ${result.checks.length} checks.`,
  );
}

async function main() {
  validatePackage();
  const command = process.argv[2] || "plan";
  const commit = process.argv.includes("--commit");
  if (!commands.has(command)) {
    throw new RealmDeploymentError("unknown_command", `Unknown command ${command}. Use plan, apply, verify, or rollback.`);
  }

  const target = resolveTarget(command !== "plan");
  printPackagePlan(target);
  if (command === "plan") return;

  const databaseUrl = process.env.REALM_STAGING_DATABASE_URL;
  if (command === "verify") {
    if (process.env.REALM_STAGING_APPROVAL !== target.approval) {
      throw new RealmDeploymentError("approval_mismatch", "Read-only verification still requires exact target approval.");
    }
    await verifyStructure(databaseUrl, target, true);
    return;
  }

  if (!commit) {
    console.log(`Dry-run complete: ${command} was not executed. Add --commit plus the exact approval token to mutate staging.`);
    return;
  }
  assertRealmMutationApproval({
    command,
    commit,
    approval: process.env.REALM_STAGING_APPROVAL,
    expectedApproval: target.approval,
    rollbackConfirmation: process.env.REALM_STAGING_ROLLBACK_CONFIRM,
  });

  if (command === "apply") {
    runPrisma(["migrate", "deploy", "--schema", "prisma/schema.prisma"], databaseUrl);
    await verifyStructure(databaseUrl, target, true);
    return;
  }

  assertLegacyRealmRollbackCompatible({
    baselineApplied: await hasAppliedMigration(databaseUrl, manifest.baselineName),
  });
  runPrisma(["db", "execute", "--file", rollbackPath, "--schema", "prisma/schema.prisma"], databaseUrl);
  await verifyStructure(databaseUrl, target, false);
}

main().catch((error) => {
  const prefix = error instanceof RealmDeploymentError ? `[${error.code}]` : "[unexpected_error]";
  console.error(`${prefix} ${error.message}`);
  process.exitCode = 1;
});
