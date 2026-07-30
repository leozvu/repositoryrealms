import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../prisma/schema.prisma');
const migration = read('../prisma/migrations/20260729230000_add_leozops_command_control/migration.sql');
const route = read('../app/api/leozops/command-intents/route.js');
const commandSources = [
  '../lib/leozops/command-admin.js', '../lib/leozops/job-admin.js',
  '../lib/leozops/runtime-admin.js', '../lib/leozops/command-handler.js',
].map(read).join('\n');

test('command storage separates intent, append-only events, payload-free jobs and runtime control', () => {
  const intent = schema.match(/model LeozOpsCommandIntent \{[\s\S]*?\n\}/)?.[0] || '';
  const event = schema.match(/model LeozOpsCommandEvent \{[\s\S]*?\n\}/)?.[0] || '';
  const job = schema.match(/model LeozOpsCommandJob \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(intent, /idempotencyKeyHash\s+String\s+@unique/);
  assert.match(intent, /repositoryIdempotencyKey\s+String\s+@unique/);
  assert.match(intent, /confirmationTokenHash\s+String/);
  assert.doesNotMatch(intent, /\bLead\b|name\s+String|email|phone|company|note/);
  assert.match(event, /@@unique\(\[intentId, sequence\]\)/);
  assert.doesNotMatch(job, /payload|targetRef|parameters|confirmationToken/i);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /REFERENCES "Lead"|INSERT INTO "LeozOpsRuntimeControl"/i);
});

test('command route selects only de-identified Lead facts and LeoZOps has no direct business writer', () => {
  const select = route.match(/select:\s*\{[\s\S]*?\}/)?.[0] || '';
  for (const field of ['id', 'source', 'value', 'stage', 'ownerId', 'createdAt', 'expectedClose']) {
    assert.match(select, new RegExp(`\\b${field}: true`));
  }
  for (const pii of ['name', 'company', 'email', 'phone', 'note']) {
    assert.doesNotMatch(select, new RegExp(`\\b${pii}:`));
  }
  assert.doesNotMatch(commandSources, /\b(?:tx|db|prisma)\.lead\.(?:create|update|updateMany|upsert|delete)/);
  assert.match(commandSources, /executeRepositoryRealmsAction/);
  assert.match(commandSources, /realmActionReceipt\.findUnique/);
});
