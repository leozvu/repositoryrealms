import test from 'node:test';
import assert from 'node:assert/strict';
import {
  realmDataSourceMode,
  realmInitialMessages,
  realmInitialOperations,
  realmLocalFixture,
} from '../lib/realm-data-source.js';

test('product Realm luôn dùng ERP và không nhận fixture demo', () => {
  const mode = realmDataSourceMode({ erpHref: '/dashboard', syncEnabled: true });
  assert.deepEqual(mode, {
    kind: 'erp',
    isErp: true,
    allowDemoFixtures: false,
    operationsSource: 'erp',
    syncRequested: true,
    initialSyncState: 'connecting',
  });
  assert.deepEqual(realmInitialOperations(mode, { quests: [{ id: 'fake' }], ledger: [{ id: 'fake' }], wallet: 99 }), {
    quests: [], ledger: [], wallet: 0, renown: 0, completedQuests: 0, streakDays: 0,
  });
  assert.deepEqual(realmInitialMessages(mode, [{ id: 'fake' }]), []);
  assert.equal(realmLocalFixture(mode, { id: 'fake' }), null);
});

test('demo Realm giữ fixture cục bộ và không gọi ERP sync', () => {
  const mode = realmDataSourceMode({ syncEnabled: true });
  const fixtures = { quests: [{ id: 'demo' }], ledger: [], wallet: 28 };
  assert.equal(mode.kind, 'demo');
  assert.equal(mode.syncRequested, false);
  assert.equal(mode.initialSyncState, 'local');
  assert.equal(realmInitialOperations(mode, fixtures), fixtures);
  assert.deepEqual(realmInitialMessages(mode, [{ id: 'demo-message' }]), [{ id: 'demo-message' }]);
  assert.deepEqual(realmLocalFixture(mode, { id: 'demo' }), { id: 'demo' });
});

test('product giữ fail-closed khi build chưa bật sync', () => {
  const mode = realmDataSourceMode({ erpHref: '/dashboard', syncEnabled: false });
  assert.equal(mode.operationsSource, 'erp');
  assert.equal(mode.syncRequested, false);
  assert.equal(mode.initialSyncState, 'unavailable');
  assert.equal(mode.allowDemoFixtures, false);
});
