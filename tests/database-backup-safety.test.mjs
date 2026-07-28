import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../scripts/backup-db.mjs', import.meta.url), 'utf8');
const legacy = fs.readFileSync(new URL('../scripts/backup-db.js', import.meta.url), 'utf8');
const directRestore = fs.readFileSync(new URL('../scripts/restore-db.js', import.meta.url), 'utf8');
const wrapper = fs.readFileSync(new URL('../backup-db.ps1', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('production backup is limited to the four approved entity schemas', () => {
  assert.match(script, /\['public', 'egoric', 'vnecom', 'egolive'\]/);
  assert.doesNotMatch(script, /PRODUCTION_SCHEMAS[^\n]*fretas/i);
  assert.match(script, /Production backup must use exactly/);
  assert.match(script, /Production backup must contain exactly/);
});

test('backup requires an explicit database URL and reviewed target approval', () => {
  assert.match(script, /BACKUP_DATABASE_URL is required/);
  assert.match(script, /BACKUP_APPROVAL does not match the reviewed target fingerprint/);
  assert.doesNotMatch(script, /process\.env\.(DATABASE_URL|DIRECT_URL)/);
  assert.match(script, /branch !== 'codex\/realms-demo'/);
  assert.match(script, /project\.projectName !== 'crmegoric-realms-demo'/);
});

test('backup is consistent, read-only, checksummed and incomplete on failure', () => {
  assert.match(script, /isolationLevel: 'RepeatableRead'/);
  assert.match(script, /SET TRANSACTION READ ONLY/);
  assert.match(script, /INCOMPLETE\.txt/);
  assert.match(script, /manifest\.json/);
  assert.match(script, /sha256\(snapshot\.bytes\)/);
  assert.match(script, /Backup checksum mismatch/);
  assert.match(script, /table_name <> '_prisma_migrations'/);
  assert.match(script, /names\.includes\('_prisma_migrations'\)/);
});

test('package and scheduler wrapper only use the hardened v2 entrypoint', () => {
  assert.equal(pkg.scripts['backup:plan'], 'node scripts/backup-db.mjs plan');
  assert.equal(pkg.scripts.backup, 'node scripts/backup-db.mjs create');
  assert.equal(pkg.scripts['backup:verify'], 'node scripts/backup-db.mjs verify');
  assert.match(wrapper, /\.env\.backup\.local/);
  assert.match(wrapper, /npm run backup/);
  assert.match(wrapper, /exit \$backupExit/);
  assert.match(legacy, /Legacy backup is disabled/);
  assert.doesNotMatch(legacy, /PrismaClient|rmSync|DATABASE_URL/);
  assert.match(directRestore, /Direct restore is disabled/);
  assert.doesNotMatch(directRestore, /PrismaClient|deleteMany|DATABASE_URL/);
});
