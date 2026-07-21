import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTokenAccessToSession, syncTokenAccess } from '../lib/auth-token.js';
import { canDecide } from '../lib/approvals.js';

test('HR plus Accountant receives persisted finance authority in an existing JWT session', () => {
  const token = syncTokenAccess(
    { uid: 'hr-1', role: 'HR', roles: ['HR'] },
    {
      id: 'hr-1', email: 'hr@egoricagency.com', name: 'Egoric HR', status: 'active',
      role: 'HR', roles: '["HR","ACCOUNTANT"]', teamId: null, userType: 'employee',
    },
  );
  const session = applyTokenAccessToSession({ user: {} }, token);

  assert.deepEqual(session.user.roles, ['HR', 'ACCOUNTANT']);
  assert.equal(canDecide({ role: 'ACCOUNTANT' }, session.user), true);
  assert.equal(canDecide({ role: 'HR' }, session.user), true);
});

test('deactivated persisted user loses every session role', () => {
  const token = syncTokenAccess(
    { uid: 'hr-1', role: 'HR', roles: ['HR', 'ACCOUNTANT'] },
    { id: 'hr-1', status: 'inactive', role: 'HR', roles: '["HR","ACCOUNTANT"]' },
  );
  const session = applyTokenAccessToSession({ user: {} }, token);

  assert.equal(session.user.accessDisabled, true);
  assert.deepEqual(session.user.roles, []);
  assert.equal(canDecide({ role: 'ACCOUNTANT' }, session.user), false);
});
