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
