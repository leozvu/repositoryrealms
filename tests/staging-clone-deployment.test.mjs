import assert from "node:assert/strict";
import test from "node:test";
import {
  FULL_STAGING_RESET_CONFIRMATION,
  STAGING_BASELINE_CONFIRMATION,
  STAGING_MIGRATION_DEPLOY_CONFIRMATION,
  StagingCloneError,
  assertFullStagingProvisionApproval,
  assertFullStagingTarget,
  assertStagingMigrationApproval,
  redactStagingDatabaseUrl,
} from "../lib/staging-clone-deployment.js";

test("full clone resolves an isolated staging database and redacts credentials", () => {
  const target = assertFullStagingTarget({
    environment: "staging",
    databaseUrl: "postgresql://realm:secret@db-stage.internal:5432/erp_stage?schema=public",
  });
  assert.equal(target.database, "erp_stage");
  assert.match(target.approval, /^realms-full-staging:db-stage\.internal:5432:erp_stage:public:[a-f0-9]{12}$/);
  assert.ok(!target.redactedUrl.includes("secret"));
});

test("full clone refuses production environments and production markers", () => {
  assert.throws(
    () =>
      assertFullStagingTarget({
        environment: "production",
        databaseUrl: "postgresql://u:p@db-stage/erp_stage?schema=public",
      }),
    (error) => error instanceof StagingCloneError && error.code === "unsafe_environment",
  );
  assert.throws(
    () =>
      assertFullStagingTarget({
        environment: "staging",
        databaseUrl: "postgresql://u:p@db-prod/erp_stage?schema=public",
      }),
    (error) => error.code === "production_marker_detected",
  );
});

test("full clone refuses a target equal to any protected database", () => {
  assert.throws(
    () =>
      assertFullStagingTarget({
        environment: "staging",
        databaseUrl: "postgresql://stage:one@db-stage/erp_stage?schema=public",
        protectedDatabaseUrls: ["postgresql://prod:two@db-stage/erp_stage?schema=public"],
      }),
    (error) => error.code === "protected_database_match",
  );
});

test("unmarked remote targets require an explicit override", () => {
  const input = {
    environment: "test",
    databaseUrl: "postgresql://u:p@random.provider.io/postgres?schema=public",
  };
  assert.throws(() => assertFullStagingTarget(input), (error) => error.code === "staging_marker_missing");
  assert.doesNotThrow(() => assertFullStagingTarget({ ...input, allowUnmarked: true }));
});

test("provision requires exact approval, reset confirmation, and a strong demo password", () => {
  const input = {
    commit: true,
    approval: "expected",
    expectedApproval: "expected",
    resetConfirmation: FULL_STAGING_RESET_CONFIRMATION,
    demoPassword: "a-long-demo-password",
  };
  assert.doesNotThrow(() => assertFullStagingProvisionApproval(input));
  assert.throws(() => assertFullStagingProvisionApproval({ ...input, commit: false }), (error) => error.code === "dry_run_only");
  assert.throws(
    () => assertFullStagingProvisionApproval({ ...input, approval: "wrong" }),
    (error) => error.code === "approval_mismatch",
  );
  assert.throws(
    () => assertFullStagingProvisionApproval({ ...input, resetConfirmation: "wrong" }),
    (error) => error.code === "reset_confirmation_missing",
  );
  assert.throws(
    () => assertFullStagingProvisionApproval({ ...input, demoPassword: "short" }),
    (error) => error.code === "weak_demo_password",
  );
});

test("redaction removes username, password, and unrelated query parameters", () => {
  assert.equal(
    redactStagingDatabaseUrl(
      "postgresql://realm-user:super-secret@db-stage.internal:5432/erp_stage?schema=public&sslmode=require",
    ),
    "postgresql://db-stage.internal:5432/erp_stage?schema=public",
  );
});

test("baseline and migration deploy require separate typed confirmations", () => {
  const common = {
    commit: true,
    approval: "expected",
    expectedApproval: "expected",
  };
  assert.doesNotThrow(() => assertStagingMigrationApproval({
    ...common,
    command: "baseline",
    confirmation: STAGING_BASELINE_CONFIRMATION,
  }));
  assert.doesNotThrow(() => assertStagingMigrationApproval({
    ...common,
    command: "deploy",
    confirmation: STAGING_MIGRATION_DEPLOY_CONFIRMATION,
  }));
  assert.throws(
    () => assertStagingMigrationApproval({ ...common, command: "deploy", confirmation: STAGING_BASELINE_CONFIRMATION }),
    (error) => error.code === "migration_confirmation_missing",
  );
  assert.throws(
    () => assertStagingMigrationApproval({ ...common, command: "baseline", commit: false }),
    (error) => error.code === "dry_run_only",
  );
});
