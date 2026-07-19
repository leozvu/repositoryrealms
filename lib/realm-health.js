export const REALM_SCHEMA_VERSION = 7;
export const LATEST_REALM_MIGRATION = '20260719110000_add_realm_pilot_preference';

export function evaluateRealmSchemaReadiness({
  userTable = false,
  collaborationTable = false,
  changeFeedTable = false,
  actionReceiptTable = false,
  pilotPreferenceColumn = false,
  migrationTable = false,
  latestMigrationApplied = false,
} = {}) {
  const missing = [];
  if (!userTable) missing.push('erp_core');
  if (!collaborationTable) missing.push('collaboration_bridge');
  if (!changeFeedTable) missing.push('change_feed');
  if (!actionReceiptTable) missing.push('action_receipts');
  if (!pilotPreferenceColumn) missing.push('pilot_preference');
  if (!migrationTable) missing.push('migration_history');
  if (migrationTable && !latestMigrationApplied) missing.push('latest_migration');
  return {
    ready: missing.length === 0,
    missing,
    schemaVersion: REALM_SCHEMA_VERSION,
  };
}
