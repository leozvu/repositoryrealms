// Sprint 1A — T2 tests: bearer-key verification (constant-time, env-hash only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyReadKey, sha256hex, readKeyFingerprint } from '../lib/leozops/auth.js';

const KEY = 'lozk_test_secret_key_value';
const HASH = sha256hex(KEY);
const ENV = { LEOZOPS_READ_KEY_HASH: HASH };

const reqWith = authHeader => ({
  headers: { get: name => (name.toLowerCase() === 'authorization' ? authHeader : null) },
});

test('correct key verifies', () => {
  const r = verifyReadKey(reqWith('Bearer ' + KEY), ENV);
  assert.equal(r.ok, true);
  assert.equal(r.fingerprint, HASH.slice(0, 8));
});

test('wrong key -> not ok', () => {
  assert.equal(verifyReadKey(reqWith('Bearer wrong-key'), ENV).ok, false);
});

test('missing authorization header -> not ok', () => {
  assert.equal(verifyReadKey(reqWith(''), ENV).ok, false);
  assert.equal(verifyReadKey(reqWith(null), ENV).ok, false);
});

test('malformed header (no Bearer / empty token) -> not ok', () => {
  assert.equal(verifyReadKey(reqWith(KEY), ENV).ok, false);          // no scheme
  assert.equal(verifyReadKey(reqWith('Bearer '), ENV).ok, false);     // empty token
  assert.equal(verifyReadKey(reqWith('Basic ' + KEY), ENV).ok, false);
});

test('env hash absent -> nothing validates (even with the right key)', () => {
  const r = verifyReadKey(reqWith('Bearer ' + KEY), {});
  assert.equal(r.ok, false);
  assert.equal(r.fingerprint, null);
});

test('env hash malformed -> nothing validates', () => {
  assert.equal(verifyReadKey(reqWith('Bearer ' + KEY), { LEOZOPS_READ_KEY_HASH: 'not-hex' }).ok, false);
});

test('revoked = hash rotated -> old key stops validating', () => {
  const rotated = { LEOZOPS_READ_KEY_HASH: sha256hex('a-different-key') };
  assert.equal(verifyReadKey(reqWith('Bearer ' + KEY), rotated).ok, false);
});

test('fingerprint helper only accepts a 64-hex hash', () => {
  assert.equal(readKeyFingerprint(HASH), HASH.slice(0, 8));
  assert.equal(readKeyFingerprint('short'), null);
  assert.equal(readKeyFingerprint(undefined), null);
});
