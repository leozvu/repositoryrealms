import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPOSITORY_REALMS_ACTION_CONTRACTS,
  executeRepositoryRealmsAction,
  repositoryRealmsContract,
  repositoryRealmsSurface,
} from '../lib/repository-realms.js';

const USER = { id: 'staff-1', name: 'Mai Anh', roles: ['STAFF'] };

test('Phase 21 parity catalog measures business invariants instead of matching buttons or API shapes', () => {
  assert.equal(REPOSITORY_REALMS_ACTION_CONTRACTS.length, 16);
  for (const contract of REPOSITORY_REALMS_ACTION_CONTRACTS) {
    assert.equal(contract.parity.presentationIndependent, true);
    assert.equal(contract.parity.buttonMatchingRequired, false);
    assert.equal(contract.parity.apiShapeMatchingRequired, false);
    assert.equal(contract.parity.sharedBusinessInvariantsRequired, true);
    assert.ok(contract.authorization.length > 0);
    assert.ok(contract.businessRules.length > 0);
    assert.match(contract.receipt, /Receipt/);
    assert.match(contract.audit, /AuditLog/);
  }
  assert.equal(repositoryRealmsSurface('task.transition'), 'campaigns');
  assert.equal(repositoryRealmsSurface('task.assign'), 'command');
  assert.equal(repositoryRealmsSurface('task.block'), 'command');
  assert.equal(repositoryRealmsSurface('task.estimate'), 'command');
  assert.equal(repositoryRealmsSurface('lead.transition'), 'embassy');
  assert.equal(repositoryRealmsSurface('task.create'), 'ceo-command');
  assert.equal(repositoryRealmsSurface('approval.request'), 'ceo-command');
});

test('Realm Suggested Action strips presentation metadata and returns RepositoryRealms receipt evidence', async () => {
  let received;
  const executor = async (_db, user, input, now) => {
    received = { user, input, now };
    return {
      idempotent: false,
      resource: 'tasks',
      event: 'update',
      action: { id: 'receipt-21', type: input.action, entityId: input.entityId },
    };
  };
  const now = new Date('2026-07-20T12:00:00.000Z');
  const result = await executeRepositoryRealmsAction({}, USER, {
    action: 'task.transition', entityId: 'task-1', expectedState: 'todo', nextState: 'in_progress',
    idempotencyKey: 'repository-realms:phase21',
    presentation: 'Suggested Action', uiLabel: 'Advance Quest', sourceControl: 'realm-card',
  }, { now, executor });

  assert.equal(Object.hasOwn(received.input, 'presentation'), false);
  assert.equal(Object.hasOwn(received.input, 'uiLabel'), false);
  assert.equal(Object.hasOwn(received.input, 'sourceControl'), false);
  assert.equal(received.user, USER);
  assert.equal(received.now, now);
  assert.deepEqual(result.repository.invariants, {
    authorization: 'enforced', businessRules: 'enforced', receipt: 'verified', audit: 'atomic',
  });
  assert.equal(result.repository.receiptId, 'receipt-21');
  assert.equal(result.repository.parity.buttonMatchingRequired, false);
});

test('RepositoryRealms rejects unregistered actions and fails closed when receipt evidence is missing', async () => {
  assert.equal(repositoryRealmsContract('invoice.approve'), null);
  await assert.rejects(
    () => executeRepositoryRealmsAction({}, USER, { action: 'invoice.approve' }),
    (error) => error.status === 400 && error.code === 'repository_realms_action_unsupported',
  );
  await assert.rejects(
    () => executeRepositoryRealmsAction({}, USER, { action: 'task.transition' }, { executor: async () => ({ resource: 'tasks' }) }),
    (error) => error.status === 500 && error.code === 'repository_realms_receipt_missing',
  );
});
