export const REALM_SCHEMA_VERSION = 8;
export const LATEST_REALM_MIGRATION = '20260719133000_add_realm_pilot_feedback';

export function evaluateRealmSchemaReadiness({
  userTable = false,
  collaborationTable = false,
  changeFeedTable = false,
  actionReceiptTable = false,
  pilotPreferenceColumn = false,
  pilotFeedbackColumns = false,
  migrationTable = false,
  latestMigrationApplied = false,
} = {}) {
  const missing = [];
  if (!userTable) missing.push('erp_core');
  if (!collaborationTable) missing.push('collaboration_bridge');
  if (!changeFeedTable) missing.push('change_feed');
  if (!actionReceiptTable) missing.push('action_receipts');
  if (!pilotPreferenceColumn) missing.push('pilot_preference');
  if (!pilotFeedbackColumns) missing.push('pilot_feedback');
  if (!migrationTable) missing.push('migration_history');
  if (migrationTable && !latestMigrationApplied) missing.push('latest_migration');
  return {
    ready: missing.length === 0,
    missing,
    schemaVersion: REALM_SCHEMA_VERSION,
  };
}

export async function inspectRealmSchemaReadiness(db) {
  const [structure] = await db.$queryRaw`
    SELECT
      to_regclass('"User"') IS NOT NULL AS "userTable",
      to_regclass('"CollaborationContactRequest"') IS NOT NULL AS "collaborationTable",
      to_regclass('"RealmChangeEvent"') IS NOT NULL AS "changeFeedTable",
      to_regclass('"RealmActionReceipt"') IS NOT NULL AS "actionReceiptTable",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'User'
          AND column_name = 'workspacePreference'
      ) AS "pilotPreferenceColumn",
      (
        SELECT COUNT(*) = 8 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Ticket'
          AND column_name IN (
            'reporterId', 'source', 'feedbackType', 'feedbackSurface',
            'feedbackContext', 'feedbackResponse', 'requestKey', 'updatedAt'
          )
      ) AS "pilotFeedbackColumns",
      to_regclass('"_prisma_migrations"') IS NOT NULL AS "migrationTable"
  `;
  let latestMigrationApplied = false;
  if (structure?.migrationTable) {
    const [migration] = await db.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = ${LATEST_REALM_MIGRATION}
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      ) AS "applied"
    `;
    latestMigrationApplied = Boolean(migration?.applied);
  }
  return evaluateRealmSchemaReadiness({ ...structure, latestMigrationApplied });
}
