import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRealmTreasuryDemoAction,
  createRealmTreasuryDemoDashboard,
  normalizeRealmRedemptionRequest,
  restoreRealmTreasuryDemoDashboard,
  serializeRealmTreasuryDashboard,
  serializeRealmTreasuryDemoState,
} from '../lib/realm-treasury.js';
import { createRealmEconomySnapshot } from '../lib/realm-economy.js';

test('Tavern catalog chỉ chấp nhận item tồn tại và idempotency key hợp lệ', () => {
  const request = normalizeRealmRedemptionRequest({ itemId: 'guild-banner', idempotencyKey: 'realm-redeem:valid-001' });
  assert.equal(request.item.kind, 'cosmetic');
  assert.equal(request.item.price, 8);
  assert.throws(
    () => normalizeRealmRedemptionRequest({ itemId: 'salary-cashout', idempotencyKey: 'realm-redeem:valid-002' }),
    (error) => error.code === 'treasury_item_not_found',
  );
  assert.throws(
    () => normalizeRealmRedemptionRequest({ itemId: 'guild-banner', idempotencyKey: 'short' }),
    (error) => error.code === 'invalid_idempotency_key',
  );
});

test('dashboard suy ra cosmetic đã sở hữu và Gold đang giữ từ approval', () => {
  const dashboard = serializeRealmTreasuryDashboard({
    wallet: 21,
    entries: [{ type: 'shop_spend', sourceType: 'shop', sourceId: 'guild-banner' }],
    approvals: [{
      id: 'approval-1', type: 'realm_redemption', refId: 'hold-1', amount: 20, requesterId: 'staff-1', requesterName: 'Mai Anh',
      status: 'pending', createdAt: new Date('2026-07-17T10:00:00.000Z'),
      payload: JSON.stringify({ itemId: 'learning-pass-300', price: 20, requesterId: 'staff-1', holdEntryId: 'hold-1' }),
    }],
  });
  assert.equal(dashboard.catalog.find((item) => item.id === 'guild-banner').owned, true);
  assert.equal(dashboard.catalog.find((item) => item.id === 'learning-pass-300').pendingRequestId, 'approval-1');
  assert.equal(dashboard.reserved, 20);
  assert.equal(dashboard.requests[0].fulfillmentStatus, 'awaiting_approval');
});

test('dashboard phân biệt quyền lợi đã duyệt, chờ Tavern Keeper và đã trao', () => {
  const approval = {
    id: 'approval-ready', type: 'realm_redemption', refId: 'hold-ready', amount: 16,
    requesterId: 'staff-1', requesterName: 'Mai Anh', status: 'approved', createdAt: '2026-07-17T10:00:00.000Z',
    payload: JSON.stringify({ itemId: 'mentor-session', price: 16, requesterId: 'staff-1', holdEntryId: 'hold-ready' }),
  };
  const ready = serializeRealmTreasuryDashboard({ approvals: [approval], keeperApprovals: [approval] });
  assert.equal(ready.requests[0].fulfillmentStatus, 'ready');
  assert.equal(ready.keeperQueue.length, 1);

  const delivered = serializeRealmTreasuryDashboard({
    approvals: [approval],
    keeperApprovals: [approval],
    fulfillmentEntries: [{ type: 'redemption_fulfillment', sourceType: 'approval', sourceId: approval.id, createdAt: '2026-07-17T11:00:00.000Z' }],
  });
  assert.equal(delivered.requests[0].fulfillmentStatus, 'fulfilled');
  assert.equal(delivered.keeperQueue.length, 0);
});

test('sandbox đổi cosmetic trực tiếp nhưng quyền lợi dùng hold, approve hoặc refund', () => {
  const initial = createRealmTreasuryDemoDashboard(30);
  const cosmetic = applyRealmTreasuryDemoAction(initial, { type: 'redeem', itemId: 'guild-banner' });
  assert.equal(cosmetic.wallet, 22);
  assert.equal(cosmetic.catalog.find((item) => item.id === 'guild-banner').owned, true);
  const equipped = applyRealmTreasuryDemoAction(cosmetic, { type: 'equip', itemId: 'guild-banner' });
  assert.equal(equipped.loadout.banner.id, 'guild-banner');
  assert.equal(equipped.inventory[0].equipped, true);

  const held = applyRealmTreasuryDemoAction(equipped, { type: 'redeem', itemId: 'mentor-session' });
  assert.equal(held.wallet, 6);
  assert.equal(held.reserved, 16);
  assert.equal(held.requests[0].status, 'pending');

  const approved = applyRealmTreasuryDemoAction(held, { type: 'demo-approve', requestId: held.requests[0].id });
  assert.equal(approved.wallet, 6);
  assert.equal(approved.reserved, 0);
  assert.equal(approved.requests[0].status, 'approved');
  assert.equal(approved.requests[0].fulfillmentStatus, 'ready');

  const fulfilled = applyRealmTreasuryDemoAction(approved, { type: 'demo-fulfill', requestId: approved.requests[0].id });
  assert.equal(fulfilled.wallet, 6);
  assert.equal(fulfilled.requests[0].fulfillmentStatus, 'fulfilled');
  assert.equal(fulfilled.action.walletDelta, 0);

  const heldAgain = applyRealmTreasuryDemoAction(createRealmTreasuryDemoDashboard(30), { type: 'redeem', itemId: 'mentor-session' });
  const rejected = applyRealmTreasuryDemoAction(heldAgain, { type: 'demo-reject', requestId: heldAgain.requests[0].id });
  assert.equal(rejected.wallet, 30);
  assert.equal(rejected.reserved, 0);
  assert.equal(rejected.requests[0].fulfillmentStatus, 'refunded');
  assert.equal(rejected.action.walletDelta, 16);
});

test('sandbox không cho trang bị cosmetic chưa sở hữu hoặc benefit', () => {
  const dashboard = createRealmTreasuryDemoDashboard(30);
  assert.throws(
    () => applyRealmTreasuryDemoAction(dashboard, { type: 'equip', itemId: 'emerald-seal' }),
    (error) => error.code === 'loadout_item_not_owned',
  );
  assert.throws(
    () => applyRealmTreasuryDemoAction(dashboard, { type: 'equip', itemId: 'mentor-session' }),
    (error) => error.code === 'loadout_item_invalid',
  );
});

test('sandbox khôi phục toàn bộ vòng đời yêu cầu Tavern sau reload', () => {
  const held = applyRealmTreasuryDemoAction(createRealmTreasuryDemoDashboard(30), { type: 'redeem', itemId: 'mentor-session' });
  const restoredHeld = restoreRealmTreasuryDemoDashboard(serializeRealmTreasuryDemoState(held), held.wallet);
  assert.equal(restoredHeld.wallet, 14);
  assert.equal(restoredHeld.reserved, 16);
  assert.equal(restoredHeld.requests[0].status, 'pending');
  assert.equal(restoredHeld.catalog.find((item) => item.id === 'mentor-session').pendingRequestId, held.requests[0].id);

  const approved = applyRealmTreasuryDemoAction(restoredHeld, { type: 'demo-approve', requestId: restoredHeld.requests[0].id });
  const fulfilled = applyRealmTreasuryDemoAction(approved, { type: 'demo-fulfill', requestId: approved.requests[0].id });
  const restoredFulfilled = restoreRealmTreasuryDemoDashboard(serializeRealmTreasuryDemoState(fulfilled), fulfilled.wallet);
  assert.equal(restoredFulfilled.reserved, 0);
  assert.equal(restoredFulfilled.requests[0].status, 'approved');
  assert.equal(restoredFulfilled.requests[0].fulfillmentStatus, 'fulfilled');
  assert.equal(restoredFulfilled.keeperQueue.length, 0);
});

test('sandbox không tin price, status hoặc item lạ trong localStorage', () => {
  const restored = restoreRealmTreasuryDemoDashboard({ requests: [
    { id: 'demo-redemption-valid-1', itemId: 'mentor-session', price: 9999, status: 'forged', createdAt: 'invalid' },
    { id: 'demo-redemption-invalid-item', itemId: 'salary-cashout', price: 1, status: 'approved' },
  ] }, 20);
  assert.equal(restored.requests.length, 1);
  assert.equal(restored.requests[0].price, 16);
  assert.equal(restored.requests[0].status, 'pending');
  assert.equal(restored.reserved, 16);
});

test('Economy Observatory không tính hold/release thành issued hoặc spend', () => {
  const base = {
    userId: 'staff-1', userName: 'Mai Anh', teamId: 'guild-1', teamName: 'Creative Guild',
    renown: 0, sourceType: 'approval', createdAt: new Date('2026-07-17T10:00:00.000Z'),
  };
  const snapshot = createRealmEconomySnapshot({
    entries: [
      { ...base, id: 'earn', type: 'quest_reward', amount: 30, label: 'Quest', sourceId: 'task-1' },
      { ...base, id: 'hold', type: 'redemption_hold', amount: -20, label: 'Hold', sourceId: 'approval-1' },
      { ...base, id: 'release', type: 'redemption_release', amount: 20, label: 'Release', sourceId: 'approval-1' },
      { ...base, id: 'spend', type: 'shop_spend', amount: -20, label: 'Spend', sourceId: 'approval-1' },
    ],
    now: new Date('2026-07-17T12:00:00.000Z'),
  });
  assert.equal(snapshot.metrics.issued, 30);
  assert.equal(snapshot.metrics.spent, 20);
  assert.equal(snapshot.metrics.reserved, 0);
  assert.equal(snapshot.metrics.netFlow, 10);
});
