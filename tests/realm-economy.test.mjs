import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmEconomyDemoSnapshot, createRealmEconomySnapshot } from '../lib/realm-economy.js';

const USER = { userId: 'staff-1', userName: 'Mai Anh', teamId: 'creative', teamName: 'Creative Guild', title: 'Designer' };
const entry = (id, day, amount, extra = {}) => ({
  id,
  ...USER,
  type: amount < 0 ? 'shop_spend' : 'quest_reward',
  amount,
  label: `Entry ${id}`,
  sourceType: 'task',
  sourceId: `TASK-${id}`,
  createdAt: new Date(`2026-07-${String(day).padStart(2, '0')}T10:00:00.000Z`),
  ...extra,
});

test('economy snapshot tách issued, spend, commitment, pending và forecast', () => {
  const snapshot = createRealmEconomySnapshot({
    entries: [entry('1', 1, 10), entry('2', 2, -4), entry('old', 30, 99, { createdAt: new Date('2026-06-30T10:00:00.000Z') })],
    rewardRows: [
      { taskId: 'open', assigneeId: 'staff-1', assignee: 'Mai Anh', gold: 5, status: 'approved', rewardIssued: false },
      { taskId: 'pending', assigneeId: 'staff-2', assignee: 'Quang Võ', gold: 7, status: 'pending', rewardIssued: false },
    ],
    budget: { cap: 50, perUserCap: 20, policyStatus: 'approved' },
    now: new Date('2026-07-10T12:00:00.000Z'),
  });
  assert.equal(snapshot.period, '2026-07');
  assert.equal(snapshot.metrics.issued, 10);
  assert.equal(snapshot.metrics.spent, 4);
  assert.equal(snapshot.metrics.netFlow, 6);
  assert.equal(snapshot.metrics.committed, 5);
  assert.equal(snapshot.metrics.pending, 7);
  assert.equal(snapshot.metrics.burnRate, 1);
  assert.equal(snapshot.metrics.forecastIssued, 31);
  assert.equal(snapshot.metrics.forecastUsage, 36);
  assert.equal(snapshot.metrics.currentUsage, 15);
  assert.equal(snapshot.ledger.length, 2);
});

test('forecast vượt cap và nghĩa vụ cá nhân đều có bằng chứng nhưng chỉ advisory', () => {
  const snapshot = createRealmEconomySnapshot({
    entries: [entry('1', 1, 12), entry('2', 2, 8)],
    rewardRows: [{ taskId: 'open', assigneeId: 'staff-1', assignee: 'Mai Anh', gold: 6, status: 'approved', rewardIssued: false }],
    budget: { cap: 30, perUserCap: 20 },
    now: new Date('2026-07-05T12:00:00.000Z'),
  });
  const codes = snapshot.alerts.map((alert) => alert.code);
  assert.ok(codes.includes('monthly_forecast_over_cap'));
  assert.ok(codes.includes('user_cap_exposure'));
  assert.ok(snapshot.alerts.every((alert) => alert.advisoryOnly === true));
  assert.ok(snapshot.alerts.every((alert) => Array.isArray(alert.evidence) && alert.evidence.length > 0));
  assert.equal('automaticAction' in snapshot, false);
});

test('repeat window và adjustment lớn sinh cảnh báo giải thích được', () => {
  const snapshot = createRealmEconomySnapshot({
    entries: [
      entry('1', 8, 2, { createdAt: new Date('2026-07-08T09:00:00.000Z') }),
      entry('2', 8, 2, { createdAt: new Date('2026-07-08T12:00:00.000Z') }),
      entry('3', 8, 2, { createdAt: new Date('2026-07-08T15:00:00.000Z') }),
      entry('4', 9, 18, { type: 'adjustment', sourceType: 'manual_review' }),
    ],
    budget: { cap: 140, perUserCap: 100 },
    now: new Date('2026-07-17T12:00:00.000Z'),
  });
  const codes = snapshot.alerts.map((alert) => alert.code);
  assert.ok(codes.includes('rapid_repeat_rewards'));
  assert.ok(codes.includes('manual_adjustment_spike'));
});

test('team scope không so forecast một team với company cap như một kết luận vượt trần', () => {
  const snapshot = createRealmEconomySnapshot({
    entries: [entry('1', 1, 20)],
    budget: { cap: 25, perUserCap: 50 },
    permissions: { canView: true, scope: 'team', teamId: 'creative' },
    now: new Date('2026-07-05T12:00:00.000Z'),
  });
  assert.equal(snapshot.metrics.forecastUsage > snapshot.policy.cap, true);
  assert.equal(snapshot.alerts.some((alert) => alert.code === 'monthly_forecast_over_cap'), false);
});

test('demo economy fixture có ledger append-only đủ loại và dữ liệu biểu đồ', () => {
  const snapshot = createRealmEconomyDemoSnapshot({ rows: [], budget: { cap: 140, perUserCap: 45 } }, new Date('2026-07-17T12:00:00.000Z'));
  assert.equal(snapshot.source, 'local');
  assert.equal(snapshot.ledger.length, 10);
  assert.equal(snapshot.daily.length, 31);
  assert.ok(snapshot.ledger.some((row) => row.type === 'quest_reward'));
  assert.ok(snapshot.ledger.some((row) => row.type === 'shop_spend'));
  assert.ok(snapshot.ledger.some((row) => row.type === 'adjustment'));
});

test('economy snapshot từ chối mốc thời gian không hợp lệ', () => {
  assert.throws(() => createRealmEconomySnapshot({ now: 'not-a-date' }), /valid date/);
});
