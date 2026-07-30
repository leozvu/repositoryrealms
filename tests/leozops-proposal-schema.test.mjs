import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = fs.readFileSync(
  new URL('../prisma/migrations/20260729190000_add_leozops_action_proposals/migration.sql', import.meta.url),
  'utf8',
);
const route = fs.readFileSync(
  new URL('../app/api/integrations/leozops/v1/action-proposals/route.js', import.meta.url),
  'utf8',
);

test('proposal storage is append-only metadata with idempotency and scope indexes', () => {
  const model = schema.match(/model LeozOpsActionProposal \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(model, /idempotencyKeyHash\s+String\s+@unique/);
  assert.match(model, /correlationId\s+String\s+@unique/);
  assert.match(model, /requesterFingerprint\s+String/);
  assert.match(model, /status\s+String\s+@default\("proposed"\)/);
  assert.doesNotMatch(model, /\bLead\b|@relation|approved|executed|receipt/i);
  assert.match(migration, /CREATE UNIQUE INDEX "LeozOpsActionProposal_idempotencyKeyHash_key"/);
  assert.match(migration, /CREATE INDEX "LeozOpsActionProposal_requesterFingerprint_createdAt_idx"/);
  assert.doesNotMatch(migration, /FOREIGN KEY|REFERENCES "Lead"/i);
});

test('route source reads only the de-identified Lead allowlist and exposes no writer', () => {
  const select = route.match(/select:\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
  for (const field of ['id', 'source', 'value', 'stage', 'ownerId', 'createdAt', 'expectedClose']) {
    assert.match(select, new RegExp(`\\b${field}: true`));
  }
  for (const pii of ['name', 'company', 'email', 'phone', 'note']) {
    assert.doesNotMatch(select, new RegExp(`\\b${pii}:`));
  }
  assert.doesNotMatch(route, /lead\.(create|update|upsert|delete)/);
});
