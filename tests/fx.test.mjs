// v3.25: test chênh lệch tỷ giá. Sai dấu lãi/lỗ là ghi sai sổ tài chính.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realizedFx, revalueItem, revaluePositions, avgBookRate } from '../lib/fx.js';

test('lãi/lỗ tỷ giá đã thực hiện khi thu', () => {
  // ghi sổ 48000 USD @ 25000, thu thực @ 25400 → lãi 400/USD × 48000 = 19,2 tr
  assert.equal(realizedFx(48000, 25000, 25400), 19_200_000, 'tỷ giá tăng → lãi');
  assert.equal(realizedFx(48000, 25400, 25000), -19_200_000, 'tỷ giá giảm → lỗ');
  assert.equal(realizedFx(1000, 25000, 25000), 0, 'không đổi → 0');
});

test('đánh giá lại một khoản còn dư', () => {
  assert.equal(revalueItem(10000, 3400, 3500), 1_000_000, 'CNY tăng 100 → lãi chưa thực hiện');
  assert.equal(revalueItem(10000, 3500, 3400), -1_000_000);
});

test('đánh giá lại danh mục nhiều đồng tiền, bỏ VND & đồng thiếu tỷ giá', () => {
  const items = [
    { currency: 'USD', amount: 50000, bookRate: 25000 }, // book 1,25 tỷ
    { currency: 'USD', amount: 10000, bookRate: 25200 }, // book 252 tr
    { currency: 'CNY', amount: 100000, bookRate: 3450 }, // book 345 tr
    { currency: 'VND', amount: 5_000_000, bookRate: 1 }, // bỏ qua
    { currency: 'EUR', amount: 2000, bookRate: 27000 },  // không có tỷ giá cuối kỳ → bỏ
  ];
  const { byCurrency, total } = revaluePositions(items, { USD: 25400, CNY: 3500 });
  // USD: (50000+10000)=60000, closeVnd=60000×25400=1,524 tỷ; bookVnd=1,25tỷ+252tr=1,502 tỷ; diff=+22tr
  assert.equal(byCurrency.USD.amount, 60000);
  assert.equal(byCurrency.USD.diff, 60000 * 25400 - (50000 * 25000 + 10000 * 25200));
  assert.equal(byCurrency.USD.diff, 22_000_000);
  // CNY: 100000×(3500−3450)=5tr
  assert.equal(byCurrency.CNY.diff, 5_000_000);
  assert.ok(!byCurrency.EUR, 'EUR không có tỷ giá cuối kỳ → không đánh giá');
  assert.ok(!byCurrency.VND, 'VND không đánh giá lại');
  assert.equal(total, 27_000_000, 'tổng lãi chưa thực hiện = 22tr + 5tr');
});

test('tỷ giá bình quân ghi sổ', () => {
  const items = [
    { currency: 'USD', amount: 50000, bookRate: 25000 },
    { currency: 'USD', amount: 10000, bookRate: 25200 },
  ];
  // (50000×25000 + 10000×25200) / 60000 = 25033.33 → làm tròn 25033
  assert.equal(avgBookRate(items, 'USD'), 25033);
  assert.equal(avgBookRate(items, 'EUR'), 0, 'không có vị thế → 0');
});
