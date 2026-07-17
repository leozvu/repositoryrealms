// v3.26: test báo cáo tài chính. Tách lãi/lỗ tỷ giá đúng chỗ + cộng kỳ đúng là cốt lõi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodMatch, incomeStatement, cashFlow, cashBalanceAsOf } from '../lib/financials.js';

const TX = [
  { type: 'income', category: 'Doanh thu xuất khẩu', amount: 250_000_000, date: '2026-07-05' },
  { type: 'income', category: 'Lãi chênh lệch tỷ giá', amount: 4_000_000, date: '2026-07-05' },
  { type: 'expense', category: 'Thanh toán nhà cung cấp', amount: 120_000_000, date: '2026-07-06' },
  { type: 'expense', category: 'Lương nhân sự', amount: 30_000_000, date: '2026-07-10' },
  { type: 'expense', category: 'Lỗ chênh lệch tỷ giá', amount: 1_000_000, date: '2026-07-12' },
  { type: 'income', category: 'Doanh thu xuất khẩu', amount: 99_000_000, date: '2026-04-01' }, // quý trước
];

test('khớp kỳ theo năm/quý/tháng', () => {
  const q3 = periodMatch({ year: 2026, quarter: 3 });
  assert.equal(q3('2026-07-05'), true);
  assert.equal(q3('2026-04-01'), false, 'tháng 4 là quý 2');
  assert.equal(periodMatch({ year: 2026, month: 7 })('2026-07-05'), true);
  assert.equal(periodMatch({ year: 2025 })('2026-07-05'), false);
});

test('KQKD tách doanh thu/chi phí tài chính (lãi/lỗ tỷ giá)', () => {
  const r = incomeStatement(TX, periodMatch({ year: 2026, quarter: 3 }));
  assert.equal(r.opRevenue, 250_000_000, 'doanh thu HĐKD KHÔNG gồm lãi tỷ giá');
  assert.equal(r.finIncome, 4_000_000, 'lãi tỷ giá vào doanh thu tài chính');
  assert.equal(r.totalOpex, 150_000_000, 'NCC 120tr + lương 30tr, KHÔNG gồm lỗ tỷ giá');
  assert.equal(r.finExpense, 1_000_000, 'lỗ tỷ giá vào chi phí tài chính');
  // LN = 250 + 4 − 150 − 1 = 103
  assert.equal(r.netProfit, 103_000_000);
  // opex không chứa danh mục tài chính
  assert.ok(!r.opex.some(o => o.cat.includes('tỷ giá')));
});

test('LCTT trực tiếp: thu/chi theo danh mục + lưu chuyển thuần', () => {
  const r = cashFlow(TX, periodMatch({ year: 2026, quarter: 3 }));
  assert.equal(r.totalIn, 254_000_000, '250 + 4 (lãi tỷ giá cũng là tiền vào)');
  assert.equal(r.totalOut, 151_000_000, '120 + 30 + 1');
  assert.equal(r.net, 103_000_000);
  assert.ok(r.inflows[0].amount >= r.inflows[r.inflows.length - 1].amount, 'sắp giảm dần');
});

test('số dư tiền lũy kế đến ngày (gồm cả kỳ trước)', () => {
  // đến hết 30/7: 250+4+99 thu − 120−30−1 chi = 202
  assert.equal(cashBalanceAsOf(TX, '2026-07-31'), 202_000_000);
  // đến 30/4: chỉ có 99tr thu quý 2
  assert.equal(cashBalanceAsOf(TX, '2026-04-30'), 99_000_000);
});
