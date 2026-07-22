import test from 'node:test';
import assert from 'node:assert/strict';
import {
  equipRealmTavernItem,
  loadRealmTreasuryDashboard,
  markRealmTavernRedemptionFulfilled,
  releaseRealmRedemptionHold,
  requestRealmTreasuryRedemption,
  settleRealmRedemptionApproval,
} from '../lib/realm-treasury-admin.js';

const STAFF = { id: 'staff-1', name: 'Mai Anh', role: 'STAFF', roles: ['STAFF'] };
const HR = { id: 'hr-1', name: 'Lan Phạm', role: 'HR', roles: ['HR'] };
const PM = { id: 'pm-1', name: 'Quân PM', role: 'PM', roles: ['PM'] };

function memoryDb(startingGold = 30) {
  let entryId = 0;
  let approvalId = 0;
  const state = {
    entries: [{
      id: 'seed-entry', userId: STAFF.id, type: 'quest_reward', amount: startingGold, renown: 0,
      label: 'Opening Gold', sourceType: 'task', sourceId: 'task-seed', idempotencyKey: 'realm-seed:opening-gold',
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
    }],
    approvals: [], audits: [], transactionOptions: [],
  };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') return true;
    return row[key] === value;
  });
  const tx = {
    realmGoldEntry: {
      findUnique: async ({ where }) => state.entries.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) || null,
      findFirst: async ({ where }) => state.entries.find((row) => matches(row, where)) || null,
      findMany: async ({ where }) => state.entries.filter((row) => matches(row, where)),
      aggregate: async ({ where }) => ({ _sum: { amount: state.entries.filter((row) => matches(row, where)).reduce((sum, row) => sum + row.amount, 0) } }),
      create: async ({ data }) => {
        const row = { id: `entry-${++entryId}`, createdAt: new Date('2026-07-17T10:00:00.000Z'), ...data };
        state.entries.push(row);
        return row;
      },
    },
    approval: {
      findUnique: async ({ where }) => state.approvals.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) || null,
      findFirst: async ({ where }) => state.approvals.find((row) => matches(row, where)) || null,
      findMany: async ({ where }) => state.approvals.filter((row) => matches(row, where)),
      create: async ({ data }) => {
        const row = { id: `approval-${++approvalId}`, decidedAt: null, ...data };
        state.approvals.push(row);
        return row;
      },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return {
    state,
    db: {
      ...tx,
      $transaction: async (callback, options) => {
        state.transactionOptions.push(options);
        return callback(tx);
      },
    },
  };
}

test('cosmetic spend là transaction Serializable, một lần và retry idempotent', async () => {
  const { db, state } = memoryDb(30);
  const first = await requestRealmTreasuryRedemption(db, STAFF, {
    itemId: 'guild-banner', idempotencyKey: 'realm-redeem:cosmetic-001',
  });
  assert.equal(first.type, 'fulfilled');
  assert.equal(first.entry.amount, -8);
  assert.equal(state.audits[0].action, 'realm_treasury_redeem');
  assert.deepEqual(state.transactionOptions[0], { isolationLevel: 'Serializable' });

  const retry = await requestRealmTreasuryRedemption(db, STAFF, {
    itemId: 'guild-banner', idempotencyKey: 'realm-redeem:cosmetic-001',
  });
  assert.equal(retry.idempotent, true);
  assert.equal(state.entries.filter((row) => row.type === 'shop_spend').length, 1);

  await assert.rejects(
    requestRealmTreasuryRedemption(db, STAFF, { itemId: 'guild-banner', idempotencyKey: 'realm-redeem:cosmetic-002' }),
    (error) => error.code === 'treasury_item_owned',
  );
});

test('loadout chỉ trang bị cosmetic đã sở hữu và ghi event zero-amount idempotent', async () => {
  const { db, state } = memoryDb(30);
  await assert.rejects(
    equipRealmTavernItem(db, STAFF, { itemId: 'iron-scribe-title', idempotencyKey: 'realm-equip:title-unowned' }),
    (error) => error.code === 'loadout_item_not_owned',
  );
  await requestRealmTreasuryRedemption(db, STAFF, {
    itemId: 'iron-scribe-title', idempotencyKey: 'realm-redeem:title-owned',
  });
  const equipped = await equipRealmTavernItem(db, STAFF, {
    itemId: 'iron-scribe-title', idempotencyKey: 'realm-equip:title-owned',
  }, new Date('2026-07-17T10:30:00.000Z'));
  assert.equal(equipped.entry.type, 'loadout_equip');
  assert.equal(equipped.entry.amount, 0);
  assert.equal(equipped.entry.sourceType, 'loadout');
  assert.equal(state.audits.at(-1).action, 'realm_loadout_equip');

  const retry = await equipRealmTavernItem(db, STAFF, {
    itemId: 'iron-scribe-title', idempotencyKey: 'realm-equip:title-owned',
  });
  assert.equal(retry.idempotent, true);
  assert.equal(state.entries.filter((entry) => entry.type === 'loadout_equip').length, 1);
  assert.equal((await loadRealmTreasuryDashboard(db, STAFF)).loadout.title.id, 'iron-scribe-title');
});

test('benefit giữ Gold, tạo approval HR và dashboard dùng tổng ví không bị giới hạn lịch sử', async () => {
  const { db, state } = memoryDb(30);
  const result = await requestRealmTreasuryRedemption(db, STAFF, {
    itemId: 'learning-pass-300', idempotencyKey: 'realm-redeem:benefit-001',
  }, new Date('2026-07-17T10:00:00.000Z'));
  assert.equal(result.type, 'pending');
  assert.equal(result.entry.type, 'redemption_hold');
  assert.equal(result.entry.amount, -20);
  assert.equal(JSON.parse(result.approval.steps)[0].role, 'HR');
  assert.equal(result.approval.status, 'pending');

  const dashboard = await loadRealmTreasuryDashboard(db, STAFF);
  assert.equal(dashboard.wallet, 10);
  assert.equal(dashboard.reserved, 20);
  assert.equal(dashboard.catalog.find((item) => item.id === 'learning-pass-300').pendingRequestId, result.approval.id);
  assert.equal(state.audits[0].action, 'realm_treasury_request');
});

test('approval append release + spend đúng một lần; reject append refund', async () => {
  const approvedStore = memoryDb(30);
  const pending = await requestRealmTreasuryRedemption(approvedStore.db, STAFF, {
    itemId: 'learning-pass-300', idempotencyKey: 'realm-redeem:benefit-approve',
  });
  const settled = await settleRealmRedemptionApproval(approvedStore.db, pending.approval, HR);
  assert.equal(settled.release.amount, 20);
  assert.equal(settled.spend.amount, -20);
  const settledRetry = await settleRealmRedemptionApproval(approvedStore.db, pending.approval, HR);
  assert.equal(settledRetry.idempotent, true);
  assert.equal(approvedStore.state.entries.filter((row) => row.type === 'redemption_release').length, 1);
  assert.equal(approvedStore.state.entries.filter((row) => row.type === 'shop_spend').length, 1);

  const rejectedStore = memoryDb(30);
  const rejectedPending = await requestRealmTreasuryRedemption(rejectedStore.db, STAFF, {
    itemId: 'mentor-session', idempotencyKey: 'realm-redeem:benefit-reject',
  });
  const released = await releaseRealmRedemptionHold(rejectedStore.db, rejectedPending.approval, HR);
  assert.equal(released.release.amount, 16);
  const wallet = await rejectedStore.db.realmGoldEntry.aggregate({ where: { userId: STAFF.id }, _sum: { amount: true } });
  assert.equal(wallet._sum.amount, 30);
});

test('Tavern Keeper chỉ trao quyền lợi đã duyệt, tạo receipt zero-amount và retry idempotent', async () => {
  const { db, state } = memoryDb(30);
  const pending = await requestRealmTreasuryRedemption(db, STAFF, {
    itemId: 'mentor-session', idempotencyKey: 'realm-redeem:keeper-flow',
  });
  pending.approval.status = 'approved';
  pending.approval.decidedAt = new Date('2026-07-17T10:15:00.000Z');

  const keeperDashboard = await loadRealmTreasuryDashboard(db, HR);
  assert.equal(keeperDashboard.permissions.canFulfill, true);
  assert.equal(keeperDashboard.keeperQueue.length, 1);

  await assert.rejects(
    markRealmTavernRedemptionFulfilled(db, STAFF, { approvalId: pending.approval.id }),
    (error) => error.code === 'self_fulfillment_forbidden',
  );
  await assert.rejects(
    markRealmTavernRedemptionFulfilled(db, PM, { approvalId: pending.approval.id }),
    (error) => error.code === 'tavern_fulfillment_forbidden',
  );

  const delivered = await markRealmTavernRedemptionFulfilled(db, HR, { approvalId: pending.approval.id });
  assert.equal(delivered.receipt.type, 'redemption_fulfillment');
  assert.equal(delivered.receipt.amount, 0);
  assert.equal(state.audits.at(-1).action, 'realm_tavern_delivery');

  const retry = await markRealmTavernRedemptionFulfilled(db, HR, { approvalId: pending.approval.id });
  assert.equal(retry.idempotent, true);
  assert.equal(state.entries.filter((entry) => entry.type === 'redemption_fulfillment').length, 1);
  assert.equal((await loadRealmTreasuryDashboard(db, HR)).keeperQueue.length, 0);
});

test('Tavern từ chối ví thiếu Gold trước khi tạo hold hoặc approval', async () => {
  const { db, state } = memoryDb(5);
  await assert.rejects(
    requestRealmTreasuryRedemption(db, STAFF, { itemId: 'mentor-session', idempotencyKey: 'realm-redeem:insufficient' }),
    (error) => error.code === 'treasury_insufficient_gold',
  );
  assert.equal(state.approvals.length, 0);
  assert.equal(state.entries.length, 1);
});
