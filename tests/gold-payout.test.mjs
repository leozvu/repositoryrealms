import assert from 'node:assert/strict';
import test from 'node:test';
import { goldBonusFor, goldPayoutSettings } from '../lib/gold-payout.js';

const ON = { goldEnabled: true, goldPayoutEnabled: true, goldToVndRate: 1000, goldMonthlyCapVnd: 2000000 };

test('công tắc quy đổi TẮT mặc định — Gold không thành tiền', () => {
  assert.equal(goldBonusFor(500, {}).amount, 0);
  // bật payout nhưng chưa bật Gold → vẫn không quy đổi (tránh cấu hình nửa vời)
  assert.equal(goldPayoutSettings({ goldPayoutEnabled: true }).enabled, false);
  assert.equal(goldBonusFor(500, { goldPayoutEnabled: true }).amount, 0);
  assert.equal(goldPayoutSettings(ON).enabled, true);
});

test('quy đổi đúng tỷ giá, làm tròn xuống nghìn đồng', () => {
  assert.deepEqual(goldBonusFor(150, ON), { gold: 150, amount: 150000, capped: false });
  assert.equal(goldBonusFor(0, ON).amount, 0);
  assert.equal(goldBonusFor(-50, ON).amount, 0); // không có thưởng âm
  assert.equal(goldBonusFor(1.9, ON).gold, 1); // Gold lẻ làm tròn xuống
  assert.equal(goldBonusFor(7, { ...ON, goldToVndRate: 1500 }).amount, 10000); // 10.500 → 10.000
});

test('trần tháng chặn lỗi cấu hình thành hóa đơn lương khổng lồ', () => {
  const huge = goldBonusFor(999999, ON);
  assert.equal(huge.amount, 2000000);
  assert.equal(huge.capped, true);
  // tỷ giá nhập sai cỡ triệu vẫn bị trần chặn
  assert.equal(goldBonusFor(100, { ...ON, goldToVndRate: 999999999 }).amount, 2000000);
});
