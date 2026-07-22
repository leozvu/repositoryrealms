import test from 'node:test';
import assert from 'node:assert/strict';
import { issueRealmToken, realmRoomKey, verifyRealmToken } from '../lib/realm-token.js';

const secret = 'test-realm-secret-with-at-least-24-characters';
const now = Date.UTC(2026, 6, 17, 12, 0, 0);

test('realm token signs scoped identity and room claims', () => {
  const token = issueRealmToken({ sub: 'session-1', realmId: 'egoric', mapId: 'castle', name: 'Sơn Vũ' }, secret, { now, ttlSeconds: 120 });
  const claims = verifyRealmToken(token, secret, { now });
  assert.equal(claims.sub, 'session-1');
  assert.equal(claims.name, 'Sơn Vũ');
  assert.equal(realmRoomKey(claims), 'egoric:castle');
  assert.equal(claims.exp - claims.iat, 120);
});

test('realm token rejects tampering, expiry and weak secrets', () => {
  const token = issueRealmToken({ sub: 'session-1', realmId: 'egoric', mapId: 'castle', name: 'Sơn Vũ' }, secret, { now, ttlSeconds: 30 });
  assert.throws(() => verifyRealmToken(`${token}x`, secret, { now }), /signature/);
  assert.throws(() => verifyRealmToken(token, secret, { now: now + 40_000, clockSkewSeconds: 0 }), /expired/);
  assert.throws(() => issueRealmToken({ sub: 'x' }, 'weak'), /24 characters/);
});
