import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  StagingCloneError,
  assertFullStagingProvisionApproval,
  assertFullStagingTarget,
} from "../lib/staging-clone-deployment.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commands = new Set(["plan", "provision", "verify"]);
const essentialTables = [
  "User", "Task", "Client", "Project", "Approval",
  "RealmProfile", "RealmGoldEntry",
  "CollaborationPresenceSession", "CollaborationContactRequest",
];
const expectedMigrations = fs.readdirSync(path.join(root, "prisma", "migrations"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

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
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === "1",
  });
}

function printPlan(target) {
  console.log("Realms full ERP/CRM staging clone gate");
  console.log(`Prisma models: ${Prisma.dmmf.datamodel.models.length}`);
  console.log("Provision strategy: reset isolated target → migrate deploy chain → sanitized demo seed → structural verification.");
  console.log("Production database URLs, domains, and Vercel projects are never used as fallback.");
  if (!target) {
    console.log("Target: not configured (set REALMS_STAGING_DATABASE_URL to validate one).");
    return;
  }
  console.log(`Target: ${target.redactedUrl}`);
  console.log(`Environment: ${target.environment}`);
  console.log(`Required approval: ${target.approval}`);
}

function runNode(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new StagingCloneError("child_command_failed", `Child command exited with status ${result.status}.`);
  }
}

function runPrisma(args, databaseUrl) {
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  runNode([prismaCli, ...args], { DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl });
}

async function verifyClone(databaseUrl, target, { expectSeed = true } = {}) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const expectedTables = Prisma.dmmf.datamodel.models.map((model) => model.dbName || model.name);
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT table_name AS "name" FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      target.schema,
    );
    const present = new Set(rows.map((row) => row.name));
    const missing = expectedTables.filter((table) => !present.has(table));
    if (missing.length) {
      throw new StagingCloneError("schema_verification_failed", `Missing Prisma tables: ${missing.join(", ")}`);
    }
    for (const table of essentialTables) {
      if (!present.has(table)) {
        throw new StagingCloneError("essential_table_missing", `Essential table ${table} is missing.`);
      }
    }
    if (!present.has("_prisma_migrations")) {
      throw new StagingCloneError("migration_history_missing", "The Prisma migration history table is missing.");
    }
    const migrationRows = await prisma.$queryRawUnsafe(
      `SELECT migration_name AS "name", finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
       FROM "_prisma_migrations" ORDER BY started_at`,
    );
    const appliedMigrations = new Set(
      migrationRows
        .filter((row) => row.finishedAt && !row.rolledBackAt)
        .map((row) => row.name),
    );
    const pendingMigrations = expectedMigrations.filter((name) => !appliedMigrations.has(name));
    if (pendingMigrations.length) {
      throw new StagingCloneError(
        "pending_migrations",
        `Staging migration history is incomplete: ${pendingMigrations.join(", ")}.`,
      );
    }

    const users = await prisma.user.count();
    const settings = await prisma.setting.count();
    if (expectSeed && (users < 8 || settings < 1)) {
      throw new StagingCloneError(
        "seed_verification_failed",
        `Demo fixtures are incomplete (users=${users}, settings=${settings}).`,
      );
    }
    console.log(
      `Verification passed: ${expectedTables.length} Prisma tables, ${appliedMigrations.size} migrations, ` +
        `${users} demo users, ${settings} company setting row(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const command = process.argv[2] || "plan";
  const commit = process.argv.includes("--commit");
  if (!commands.has(command)) {
    throw new StagingCloneError("unknown_command", `Unknown command ${command}. Use plan, provision, or verify.`);
  }

  const target = resolveTarget(command !== "plan");
  printPlan(target);
  if (command === "plan") return;

  const databaseUrl = process.env.REALMS_STAGING_DATABASE_URL;
  if (command === "verify") {
    if (process.env.REALMS_STAGING_APPROVAL !== target.approval) {
      throw new StagingCloneError("approval_mismatch", "Read-only verification requires the exact target approval token.");
    }
    await verifyClone(databaseUrl, target);
    return;
  }

  if (!commit) {
    console.log("Dry-run complete: no database command executed. Add --commit and all approval variables to provision staging.");
    return;
  }
  assertFullStagingProvisionApproval({
    commit,
    approval: process.env.REALMS_STAGING_APPROVAL,
    expectedApproval: target.approval,
    resetConfirmation: process.env.REALMS_STAGING_RESET_CONFIRM,
    demoPassword: process.env.REALMS_STAGING_DEMO_PASSWORD,
  });

  runPrisma(["migrate", "reset", "--force", "--skip-seed", "--skip-generate", "--schema", "prisma/schema.prisma"], databaseUrl);
  runNode([path.join(root, "prisma", "seed.js")], {
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    SEED_PASSWORD: process.env.REALMS_STAGING_DEMO_PASSWORD,
    SEED_SHOW_PASSWORD: "0",
  });
  await verifyClone(databaseUrl, target);
}

main().catch((error) => {
  const prefix = error instanceof StagingCloneError ? `[${error.code}]` : "[unexpected_error]";
  console.error(`${prefix} ${error.message}`);
  process.exitCode = 1;
});
