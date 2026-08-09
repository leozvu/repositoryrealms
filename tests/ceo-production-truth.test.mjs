import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CEO_BACKUP_FORMAT,
  databaseFingerprint,
  decryptBackup,
  encryptBackup,
  parseEnvText,
  withSchema,
} from '../scripts/lib/ceo-production-truth.mjs';
import { initializeSecretFile, readBackupSecret } from '../scripts/collect-ceo-backup-exports.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('CEO production truth parses Vercel env files without executing content', () => {
  const values = parseEnvText('DATABASE_URL="postgresql://u:p@db.test/app?schema=public"\nRAW=value\n# ignored\n');
  assert.equal(values.RAW, 'value');
  assert.equal(values.DATABASE_URL, 'postgresql://u:p@db.test/app?schema=public');
});

test('CEO production truth changes only the schema query parameter and fingerprints no credentials', () => {
  const source = 'postgresql://private-user:private-pass@db.example:5432/app?sslmode=require&schema=public';
  const changed = new URL(withSchema(source, 'egoric'));
  assert.equal(changed.searchParams.get('schema'), 'egoric');
  assert.equal(changed.searchParams.get('sslmode'), 'require');
  const fingerprint = databaseFingerprint(source, 'egoric');
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(fingerprint, /private/);
  assert.throws(() => withSchema(source, 'public;drop schema public'));
});

test('CEO production truth encrypts, authenticates and decrypts backup payloads', () => {
  const secret = 'a-strong-dedicated-test-secret-with-32-characters';
  const payload = { schema: 'ceoportal', data: { User: [{ id: 'u1', createdAt: '2026-08-09T00:00:00.000Z' }] } };
  let counter = 0;
  const deterministicRandom = (size) => Buffer.alloc(size, ++counter);
  const encrypted = encryptBackup(payload, secret, deterministicRandom);
  const envelope = JSON.parse(encrypted.toString('utf8'));
  assert.equal(envelope.format, CEO_BACKUP_FORMAT);
  assert.equal(encrypted.toString('utf8').includes('u1'), false);
  assert.deepEqual(decryptBackup(encrypted, secret), payload);
  const tampered = JSON.parse(encrypted.toString('utf8'));
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -4)}AAAA`;
  assert.throws(() => decryptBackup(Buffer.from(JSON.stringify(tampered)), secret));
});

test('CEO production truth creates a one-time backup secret without overwriting it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-backup-secret-'));
  const file = path.join(directory, 'secret');
  try {
    initializeSecretFile(file);
    assert.ok(readBackupSecret(file).length >= 48);
    assert.throws(() => initializeSecretFile(file));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CEO production truth reads legacy schemas without requiring every current Prisma column', () => {
  const source = fs.readFileSync(new URL('../scripts/lib/ceo-production-truth.mjs', import.meta.url), 'utf8');
  assert.match(source, /SELECT \* FROM/);
  assert.match(source, /scalarFields\.has\(key\)/);
  assert.doesNotMatch(source, /tx\[delegate\]\.findMany/);
});
