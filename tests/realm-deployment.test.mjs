import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  REALM_PHASE12_ROLLBACK_CONFIRMATION,
  RealmDeploymentError,
  assertLegacyRealmRollbackCompatible,
  assertRealmMutationApproval,
  assertRealmStagingTarget,
  redactDatabaseUrl,
  sha256Text,
} from "../lib/realm-deployment.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "prisma", "realm-phase12-manifest.json"), "utf8"));
const migration = fs.readFileSync(
  path.join(root, "prisma", "migrations", manifest.migrationName, "migration.sql"),
  "utf8",
);
const baseline = fs.readFileSync(
  path.join(root, "prisma", "migrations", manifest.baselineName, "migration.sql"),
  "utf8",
);
const rollback = fs.readFileSync(
  path.join(root, "prisma", "realm-rollbacks", `${manifest.migrationName}.down.sql`),
  "utf8",
);

test("staging target requires an isolated matching schema", () => {
  const target = assertRealmStagingTarget({
    environment: "staging",
    databaseUrl: "postgresql://realm:secret@db-stage.internal:5432/erp_stage?schema=realm_stage",
    expectedSchema: "realm_stage",
  });

  assert.equal(target.schema, "realm_stage");
  assert.equal(target.approval, "realm-phase12:db-stage.internal:5432:erp_stage:realm_stage");
  assert.ok(!target.redactedUrl.includes("secret"));
});

test("production environments and explicit production targets are refused", () => {
  assert.throws(
    () =>
      assertRealmStagingTarget({
        environment: "production",
        databaseUrl: "postgresql://u:p@db-stage/erp_stage?schema=realm_stage",
        expectedSchema: "realm_stage",
      }),
    (error) => error instanceof RealmDeploymentError && error.code === "unsafe_environment",
  );

  assert.throws(
    () =>
      assertRealmStagingTarget({
        environment: "staging",
        databaseUrl: "postgresql://u:p@db-prod/erp?schema=realm_stage",
        expectedSchema: "realm_stage",
      }),
    (error) => error instanceof RealmDeploymentError && error.code === "production_marker_detected",
  );
});

test("public and mismatched schemas are blocked by default", () => {
  assert.throws(
    () =>
      assertRealmStagingTarget({
        environment: "test",
        databaseUrl: "postgresql://u:p@localhost/erp_test?schema=public",
        expectedSchema: "public",
      }),
    (error) => error instanceof RealmDeploymentError && error.code === "public_schema_blocked",
  );
  assert.throws(
    () =>
      assertRealmStagingTarget({
        environment: "staging",
        databaseUrl: "postgresql://u:p@db-stage/erp_stage?schema=realm_stage",
        expectedSchema: "other_stage",
      }),
    (error) => error instanceof RealmDeploymentError && error.code === "schema_mismatch",
  );
});

test("mutations require commit, exact target approval, and an extra rollback token", () => {
  const input = {
    command: "apply",
    commit: true,
    approval: "realm-phase12:db-stage:erp_stage:realm_stage",
    expectedApproval: "realm-phase12:db-stage:erp_stage:realm_stage",
  };
  assert.doesNotThrow(() => assertRealmMutationApproval(input));
  assert.throws(
    () => assertRealmMutationApproval({ ...input, commit: false }),
    (error) => error.code === "dry_run_only",
  );
  assert.throws(
    () => assertRealmMutationApproval({ ...input, approval: "wrong" }),
    (error) => error.code === "approval_mismatch",
  );
  assert.throws(
    () => assertRealmMutationApproval({ ...input, command: "rollback" }),
    (error) => error.code === "rollback_confirmation_missing",
  );
  assert.doesNotThrow(() =>
    assertRealmMutationApproval({
      ...input,
      command: "rollback",
      rollbackConfirmation: REALM_PHASE12_ROLLBACK_CONFIRMATION,
    }),
  );
});

test("database URLs are redacted without leaking credentials", () => {
  const redacted = redactDatabaseUrl(
    "postgresql://realm-user:super-secret@db-stage.internal:5432/erp_stage?schema=realm_stage&sslmode=require",
  );
  assert.equal(redacted, "postgresql://db-stage.internal:5432/erp_stage?schema=realm_stage");
});

test("manifest checksums lock both forward and rollback SQL", () => {
  assert.equal(sha256Text(baseline), manifest.baselineSha256);
  assert.equal(sha256Text(migration), manifest.migrationSha256);
  assert.equal(sha256Text(rollback), manifest.rollbackSha256);
});

test("full baseline can create every Prisma table before additive hardening", () => {
  const createdTables = [...baseline.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(createdTables.length, 64);
  for (const table of ["User", "Task", "RealmProfile", "CollaborationPresenceSession", "CollaborationContactRequest"]) {
    assert.ok(createdTables.includes(table), `baseline must create ${table}`);
  }
  assert.ok(manifest.baselineName < manifest.migrationName, "baseline migration must sort before Realm hardening");
  assert.doesNotMatch(baseline, /^\s*(?:INSERT|UPDATE|DELETE)\s/im);
});

test("forward migration is additive to existing ERP tables", () => {
  for (const table of manifest.additiveTables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  }
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:User|Task)"/);
  assert.match(migration, /requires existing "User" and "Task" tables/i);
});

test("rollback is scoped to Realm tables and removes the migration receipt", () => {
  assert.match(rollback, /DELETE FROM "_prisma_migrations"/);
  assert.doesNotMatch(rollback, /DROP TABLE "(?:User|Task)"/);
  for (const table of manifest.additiveTables) {
    assert.match(rollback, new RegExp(`DROP TABLE "${table}"`));
  }
});

test("legacy destructive rollback is blocked after the full baseline is recorded", () => {
  assert.doesNotThrow(() => assertLegacyRealmRollbackCompatible({ baselineApplied: false }));
  assert.throws(
    () => assertLegacyRealmRollbackCompatible({ baselineApplied: true }),
    (error) => error instanceof RealmDeploymentError && error.code === "baseline_managed_rollback",
  );
});
