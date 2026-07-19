import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LATEST_REALM_MIGRATION,
  REALM_SCHEMA_VERSION,
  evaluateRealmSchemaReadiness,
  inspectRealmSchemaReadiness,
} from '../lib/realm-health.js';

test('Realm readiness requires ERP core, collaboration bridge, action receipts, pilot controls and latest migration', () => {
  const ready = evaluateRealmSchemaReadiness({
    userTable: true,
    collaborationTable: true,
    changeFeedTable: true,
    actionReceiptTable: true,
    pilotPreferenceColumn: true,
    pilotFeedbackColumns: true,
    migrationTable: true,
    latestMigrationApplied: true,
  });
  assert.deepEqual(ready, { ready: true, missing: [], schemaVersion: REALM_SCHEMA_VERSION });
  assert.match(LATEST_REALM_MIGRATION, /^\d{14}_[a-z0-9_]+$/);
});

test('Realm readiness reports safe component names instead of database details', () => {
  const state = evaluateRealmSchemaReadiness({ migrationTable: true });
  assert.equal(state.ready, false);
  assert.deepEqual(state.missing, ['erp_core', 'collaboration_bridge', 'change_feed', 'action_receipts', 'pilot_preference', 'pilot_feedback', 'latest_migration']);
});

test('Realm schema inspection verifies the latest applied migration when migration history exists', async () => {
  const rows = [
    [{
      userTable: true,
      collaborationTable: true,
      changeFeedTable: true,
      actionReceiptTable: true,
      pilotPreferenceColumn: true,
      pilotFeedbackColumns: true,
      migrationTable: true,
    }],
    [{ applied: true }],
  ];
  const db = { $queryRaw: async () => rows.shift() };
  const state = await inspectRealmSchemaReadiness(db);
  assert.deepEqual(state, { ready: true, missing: [], schemaVersion: REALM_SCHEMA_VERSION });
  assert.equal(rows.length, 0);
});

test('Realm schema inspection does not query a missing migration table', async () => {
  let queries = 0;
  const db = {
    $queryRaw: async () => {
      queries += 1;
      return [{
        userTable: true,
        collaborationTable: true,
        changeFeedTable: true,
        actionReceiptTable: true,
        pilotPreferenceColumn: true,
        pilotFeedbackColumns: true,
        migrationTable: false,
      }];
    },
  };
  const state = await inspectRealmSchemaReadiness(db);
  assert.equal(state.ready, false);
  assert.deepEqual(state.missing, ['migration_history']);
  assert.equal(queries, 1);
});
