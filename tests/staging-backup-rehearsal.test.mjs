import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../scripts/backup-realms-staging.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('restore rehearsal is isolated, explicitly confirmed and always cleans its temporary schema', () => {
  assert.match(script, /CREATE_AND_DROP_ISOLATED_RESTORE_TEST_SCHEMA/);
  assert.match(script, /const RESTORE_SCHEMA_PREFIX = 'restore_test_'/);
  assert.match(script, /assertRestoreSchemaName\(safeRestoreSchemaName\(\)\)/);
  assert.match(script, /schema === resolvedTarget\.schema/);
  assert.match(script, /REALMS_STAGING_DIRECT_URL does not match the approved staging target/);
  assert.match(script, /CREATE SCHEMA/);
  assert.match(script, /if \(created\) await admin\.\$executeRawUnsafe\(`DROP SCHEMA/);
  assert.match(script, /finally \{\s*await admin\.\$disconnect\(\)/);
});

test('restore rehearsal verifies archive integrity, row counts and primary identities', () => {
  assert.match(script, /Backup checksum mismatch/);
  assert.match(script, /Legacy backup checksum mismatch/);
  assert.match(script, /Backup manifest model count mismatch/);
  assert.match(script, /Restored count mismatch/);
  assert.match(script, /Restored identity mismatch/);
  assert.match(script, /archive_sha256/);
  assert.match(script, /isolated_restore_counts/);
});

test('legacy rehearsal is limited to the four approved entity schemas', () => {
  assert.match(script, /\['public', 'egoric', 'vnecom', 'egolive'\]/);
  assert.doesNotMatch(script, /ENTITY_SCHEMAS[^\n]*fretas/);
  assert.match(script, /path\.basename\(entry\.file \|\| ''\) !== entry\.file/);
  assert.equal(pkg.scripts['staging:backup:rehearse'], 'node scripts/backup-realms-staging.mjs rehearse');
  assert.equal(pkg.scripts['staging:backup:rehearse:legacy'], 'node scripts/backup-realms-staging.mjs rehearse-legacy');
});
