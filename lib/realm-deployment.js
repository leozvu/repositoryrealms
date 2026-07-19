import { createHash } from "node:crypto";

export const REALM_PHASE12_MIGRATION = "20260717190000_add_realm_reward_governance";
export const REALM_PHASE12_ROLLBACK_CONFIRMATION = "DROP_REALM_PHASE12_STAGING_DATA";

const SAFE_ENVIRONMENTS = new Set(["development", "staging", "test"]);
const NON_PRODUCTION_MARKER = /(^|[-_.])(stage|staging|dev|development|test|preview)([-_.]|$)/i;
const PRODUCTION_MARKER = /(^|[-_.])(prod|production|live)([-_.]|$)/i;

export class RealmDeploymentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RealmDeploymentError";
    this.code = code;
  }
}

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new RealmDeploymentError(
      "missing_staging_url",
      "REALM_STAGING_DATABASE_URL is required; the gate never falls back to DATABASE_URL.",
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new RealmDeploymentError("invalid_staging_url", "REALM_STAGING_DATABASE_URL is not a valid URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new RealmDeploymentError("invalid_staging_protocol", "Realm staging migrations require PostgreSQL.");
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const schema = parsed.searchParams.get("schema") || "public";
  if (!database) {
    throw new RealmDeploymentError("missing_database_name", "The staging URL must include a database name.");
  }

  return { parsed, database, schema };
}

export function redactDatabaseUrl(databaseUrl) {
  const { parsed, database, schema } = parseDatabaseUrl(databaseUrl);
  return `${parsed.protocol}//${parsed.host}/${database}?schema=${encodeURIComponent(schema)}`;
}

export function assertRealmStagingTarget({
  environment,
  databaseUrl,
  expectedSchema,
  allowPublic = false,
  allowUnmarked = false,
}) {
  const normalizedEnvironment = String(environment || "").trim().toLowerCase();
  if (!SAFE_ENVIRONMENTS.has(normalizedEnvironment)) {
    throw new RealmDeploymentError(
      "unsafe_environment",
      "REALM_DEPLOY_ENV must be development, staging, or test. Production is intentionally unsupported.",
    );
  }

  const { parsed, database, schema } = parseDatabaseUrl(databaseUrl);
  const normalizedExpectedSchema = String(expectedSchema || "").trim();
  if (!normalizedExpectedSchema) {
    throw new RealmDeploymentError("missing_schema_guard", "REALM_STAGING_SCHEMA must be set explicitly.");
  }
  if (schema !== normalizedExpectedSchema) {
    throw new RealmDeploymentError(
      "schema_mismatch",
      `URL schema ${schema} does not match REALM_STAGING_SCHEMA ${normalizedExpectedSchema}.`,
    );
  }
  if (schema === "public" && !allowPublic) {
    throw new RealmDeploymentError(
      "public_schema_blocked",
      "The public schema is blocked by default. Use an isolated staging schema.",
    );
  }

  const markerParts = [parsed.hostname, database, schema];
  if (markerParts.some((part) => PRODUCTION_MARKER.test(part))) {
    throw new RealmDeploymentError(
      "production_marker_detected",
      "The database target contains an explicit production marker and cannot be used by this gate.",
    );
  }

  const isLocal = new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname);
  if (!allowUnmarked && !isLocal && !markerParts.some((part) => NON_PRODUCTION_MARKER.test(part))) {
    throw new RealmDeploymentError(
      "staging_marker_missing",
      "The target must contain a staging/dev/test marker unless the unmarked-target override is explicit.",
    );
  }

  const approval = `realm-phase12:${parsed.host}:${database}:${schema}`;
  return {
    environment: normalizedEnvironment,
    host: parsed.host,
    database,
    schema,
    approval,
    redactedUrl: redactDatabaseUrl(databaseUrl),
  };
}

export function assertRealmMutationApproval({
  command,
  commit,
  approval,
  expectedApproval,
  rollbackConfirmation,
}) {
  if (!commit) {
    throw new RealmDeploymentError(
      "dry_run_only",
      `${command} is a dry-run without --commit; no database command may execute.`,
    );
  }
  if (approval !== expectedApproval) {
    throw new RealmDeploymentError(
      "approval_mismatch",
      "REALM_STAGING_APPROVAL does not exactly match the resolved staging target.",
    );
  }
  if (command === "rollback" && rollbackConfirmation !== REALM_PHASE12_ROLLBACK_CONFIRMATION) {
    throw new RealmDeploymentError(
      "rollback_confirmation_missing",
      "Rollback deletes all Realm staging data and requires the dedicated rollback confirmation token.",
    );
  }
}

export function assertLegacyRealmRollbackCompatible({ baselineApplied }) {
  if (baselineApplied) {
    throw new RealmDeploymentError(
      "baseline_managed_rollback",
      "This staging database is managed by the full baseline. Restore a staging snapshot or ship a reviewed forward-fix instead of dropping baseline tables.",
    );
  }
}
