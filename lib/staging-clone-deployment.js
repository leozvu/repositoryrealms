import { createHash } from "node:crypto";

const SAFE_ENVIRONMENTS = new Set(["development", "staging", "test"]);
const NON_PRODUCTION_MARKER = /(^|[-_.])(stage|staging|dev|development|test|preview)([-_.]|$)/i;
const PRODUCTION_MARKER = /(^|[-_.])(prod|production|live)([-_.]|$)/i;

export const FULL_STAGING_RESET_CONFIRMATION = "RESET_REALMS_FULL_STAGING_WITH_DEMO_DATA";
export const STAGING_BASELINE_CONFIRMATION = "BASELINE_EXISTING_REALMS_STAGING_SCHEMA";
export const STAGING_MIGRATION_DEPLOY_CONFIRMATION = "DEPLOY_REALMS_STAGING_MIGRATIONS";

export class StagingCloneError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StagingCloneError";
    this.code = code;
  }
}

function parseTarget(databaseUrl) {
  if (!databaseUrl) {
    throw new StagingCloneError(
      "missing_staging_url",
      "REALMS_STAGING_DATABASE_URL is required; the clone gate never falls back to DATABASE_URL.",
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new StagingCloneError("invalid_staging_url", "REALMS_STAGING_DATABASE_URL is not a valid URL.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new StagingCloneError("invalid_staging_protocol", "The full staging clone requires PostgreSQL.");
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const schema = parsed.searchParams.get("schema") || "public";
  if (!database) throw new StagingCloneError("missing_database_name", "The staging URL must include a database name.");
  return { parsed, database, schema };
}

function targetFingerprint(databaseUrl) {
  const { parsed, database, schema } = parseTarget(databaseUrl);
  return `${parsed.protocol}//${parsed.host}/${database}?schema=${schema}`.toLowerCase();
}

export function redactStagingDatabaseUrl(databaseUrl) {
  const { parsed, database, schema } = parseTarget(databaseUrl);
  return `${parsed.protocol}//${parsed.host}/${database}?schema=${encodeURIComponent(schema)}`;
}

export function approvalDigest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

export function assertFullStagingTarget({
  environment,
  databaseUrl,
  protectedDatabaseUrls = [],
  allowUnmarked = false,
}) {
  const normalizedEnvironment = String(environment || "").trim().toLowerCase();
  if (!SAFE_ENVIRONMENTS.has(normalizedEnvironment)) {
    throw new StagingCloneError(
      "unsafe_environment",
      "REALMS_DEPLOY_ENV must be development, staging, or test. Production is intentionally unsupported.",
    );
  }

  const { parsed, database, schema } = parseTarget(databaseUrl);
  const markerParts = [parsed.hostname, database, schema];
  if (markerParts.some((part) => PRODUCTION_MARKER.test(part))) {
    throw new StagingCloneError(
      "production_marker_detected",
      "The target contains an explicit production marker and cannot be used by the full-clone gate.",
    );
  }

  const fingerprint = targetFingerprint(databaseUrl);
  for (const protectedUrl of protectedDatabaseUrls.filter(Boolean)) {
    if (targetFingerprint(protectedUrl) === fingerprint) {
      throw new StagingCloneError(
        "protected_database_match",
        "The staging target matches a protected application database URL.",
      );
    }
  }

  const isLocal = new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname);
  if (!allowUnmarked && !isLocal && !markerParts.some((part) => NON_PRODUCTION_MARKER.test(part))) {
    throw new StagingCloneError(
      "staging_marker_missing",
      "Host, database, or schema must contain a staging/dev/test marker unless the explicit override is enabled.",
    );
  }

  const approvalSource = `${parsed.host}:${database}:${schema}`;
  return {
    environment: normalizedEnvironment,
    host: parsed.host,
    database,
    schema,
    approval: `realms-full-staging:${approvalSource}:${approvalDigest(approvalSource)}`,
    redactedUrl: redactStagingDatabaseUrl(databaseUrl),
  };
}

export function assertFullStagingProvisionApproval({
  commit,
  approval,
  expectedApproval,
  resetConfirmation,
  demoPassword,
}) {
  if (!commit) {
    throw new StagingCloneError("dry_run_only", "Provision is dry-run without --commit; no database command may execute.");
  }
  if (approval !== expectedApproval) {
    throw new StagingCloneError(
      "approval_mismatch",
      "REALMS_STAGING_APPROVAL does not exactly match the resolved staging target.",
    );
  }
  if (resetConfirmation !== FULL_STAGING_RESET_CONFIRMATION) {
    throw new StagingCloneError(
      "reset_confirmation_missing",
      "Provision recreates the entire staging schema and requires the dedicated reset confirmation token.",
    );
  }
  if (String(demoPassword || "").length < 12) {
    throw new StagingCloneError(
      "weak_demo_password",
      "REALMS_STAGING_DEMO_PASSWORD must contain at least 12 characters.",
    );
  }
}

export function assertStagingMigrationApproval({
  command,
  commit,
  approval,
  expectedApproval,
  confirmation,
}) {
  if (!commit) {
    throw new StagingCloneError(
      "dry_run_only",
      `${command} is a dry-run without --commit; no migration state may change.`,
    );
  }
  if (approval !== expectedApproval) {
    throw new StagingCloneError(
      "approval_mismatch",
      "REALMS_STAGING_APPROVAL does not exactly match the resolved staging target.",
    );
  }
  const expectedConfirmation = command === "baseline"
    ? STAGING_BASELINE_CONFIRMATION
    : STAGING_MIGRATION_DEPLOY_CONFIRMATION;
  if (confirmation !== expectedConfirmation) {
    throw new StagingCloneError(
      "migration_confirmation_missing",
      `${command} requires the dedicated confirmation token ${expectedConfirmation}.`,
    );
  }
}
