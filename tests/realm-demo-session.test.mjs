import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REALM_DEMO_SESSION_DEFAULT_EMAIL,
  realmDemoSessionCandidate,
  realmDemoSessionCookieName,
  realmDemoSessionPolicy,
  realmDemoSessionRequestAllowed,
  realmDemoSessionToken,
} from '../lib/realm-demo-session.js';

const staff = {
  id: 'staff-1',
  email: REALM_DEMO_SESSION_DEFAULT_EMAIL,
  name: 'Demo Staff',
  role: 'STAFF',
  roles: '["STAFF"]',
  status: 'active',
  userType: 'employee',
  teamId: 'team-1',
  totpSecret: null,
  accessUntil: null,
};

test('demo SSO can only be enabled explicitly on a Vercel preview', () => {
  assert.equal(realmDemoSessionPolicy({ VERCEL_ENV: 'preview', REALMS_DEMO_SSO_ENABLED: '1' }).enabled, true);
  assert.equal(realmDemoSessionPolicy({ VERCEL_ENV: 'production', REALMS_DEMO_SSO_ENABLED: '1' }).enabled, false);
  assert.equal(realmDemoSessionPolicy({ VERCEL_ENV: 'preview' }).enabled, false);
});

test('demo SSO only accepts an active, non-2FA, non-privileged STAFF identity', () => {
  assert.equal(realmDemoSessionCandidate(staff, ['STAFF']), true);
  assert.equal(realmDemoSessionCandidate({ ...staff, role: 'DIRECTOR' }, ['DIRECTOR']), false);
  assert.equal(realmDemoSessionCandidate({ ...staff, totpSecret: 'secret' }, ['STAFF']), false);
  assert.equal(realmDemoSessionCandidate(staff, ['STAFF', 'HR']), false);
  assert.equal(realmDemoSessionCandidate({ ...staff, status: 'inactive' }, ['STAFF']), false);
});

test('demo SSO rejects cross-origin browser requests', () => {
  const request = (origin, fetchSite = 'same-origin') => ({
    nextUrl: { origin: 'https://realms.example.test' },
    headers: { get: (name) => name === 'origin' ? origin : name === 'sec-fetch-site' ? fetchSite : null },
  });
  assert.equal(realmDemoSessionRequestAllowed(request('https://realms.example.test')), true);
  assert.equal(realmDemoSessionRequestAllowed(request('https://evil.example.test', 'cross-site')), false);
});

test('demo SSO produces the same NextAuth identity fields used by ERP', () => {
  const token = realmDemoSessionToken(staff, ['STAFF']);
  assert.deepEqual(token, {
    sub: 'staff-1',
    uid: 'staff-1',
    name: 'Demo Staff',
    email: REALM_DEMO_SESSION_DEFAULT_EMAIL,
    role: 'STAFF',
    roles: ['STAFF'],
    teamId: 'team-1',
    userType: 'employee',
    realmDemo: true,
  });
  assert.equal(realmDemoSessionCookieName(true), '__Secure-next-auth.session-token');
  assert.equal(realmDemoSessionCookieName(false), 'next-auth.session-token');
});
