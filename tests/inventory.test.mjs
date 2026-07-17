// v3.24: test logic kho hàng theo lô. Tồn/giá vốn/hạn dùng sai là mất tiền thật (hàng tươi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotRemaining, lotValue, lotDisplayStatus, canIssue, stockSummary, allocateFEFO } from '../lib/inventory.js';

test('tồn còn lại = nhập − xuất, không âm', () => {
  assert.equal(lotRemaining({ qtyIn: 1000, qtyOut: 300 }), 700);
  assert.equal(lotRemaining({ qtyIn: 1000, qtyOut: 1000 }), 0);
  assert.equal(lotRemaining({ qtyIn: 500, qtyOut: 600 }), 0, 'không âm dù dữ liệu lệch');
  assert.equal(lotRemaining({}), 0);
});

test('giá trị tồn = kg còn × giá vốn', () => {
  assert.equal(lotValue({ qtyIn: 1000, qtyOut: 200, unitCost: 25000 }), 800 * 25000);
  assert.equal(lotValue({ qtyIn: 1000, qtyOut: 1000, unitCost: 25000 }), 0, 'xuất hết → 0');
});

test('trạng thái hiển thị: quá hạn > hết tồn > cận hạn > còn tồn', () => {
  const today = '2026-07-16';
  assert.equal(lotDisplayStatus({ qtyIn: 100, qtyOut: 0, expiryDate: '2026-07-10' }, today), 'expired');
  assert.equal(lotDisplayStatus({ qtyIn: 100, qtyOut: 100, expiryDate: '2026-08-01' }, today), 'depleted');
  assert.equal(lotDisplayStatus({ qtyIn: 100, qtyOut: 0, expiryDate: '2026-07-19' }, today), 'expiring', '3 ngày tới → cận hạn');
  assert.equal(lotDisplayStatus({ qtyIn: 100, qtyOut: 0, expiryDate: '2026-08-30' }, today), 'in_stock');
  // quá hạn ưu tiên hơn hết tồn: lô quá hạn mà cũng hết tồn → vẫn báo expired
  assert.equal(lotDisplayStatus({ qtyIn: 100, qtyOut: 100, expiryDate: '2026-07-01' }, today), 'expired');
});

test('chặn xuất quá tồn', () => {
  const lot = { qtyIn: 500, qtyOut: 100 }; // còn 400
  assert.equal(canIssue(lot, 400).ok, true);
  assert.equal(canIssue(lot, 401).ok, false, 'vượt tồn → chặn');
  assert.equal(canIssue(lot, 0).ok, false, 'phải > 0');
  assert.equal(canIssue(lot, -5).ok, false);
});

test('tổng hợp tồn kho: loại lô quá hạn khỏi hàng bán được', () => {
  const today = '2026-07-16';
  const lots = [
    { crop: 'Chanh dây', qtyIn: 1000, qtyOut: 200, unitCost: 20000, expiryDate: '2026-08-30' }, // còn 800, tồn ok
    { crop: 'Chanh dây', qtyIn: 500, qtyOut: 0, unitCost: 20000, expiryDate: '2026-07-18' },     // 500 cận hạn
    { crop: 'Chôm chôm', qtyIn: 300, qtyOut: 0, unitCost: 15000, expiryDate: '2026-07-10' },      // quá hạn → loại
  ];
  const s = stockSummary(lots, today);
  assert.equal(s.totalKg, 1300, 'chỉ 800 + 500, KHÔNG tính lô quá hạn');
  assert.equal(s.totalValue, 800 * 20000 + 500 * 20000);
  assert.equal(s.expiringKg, 500);
  assert.equal(s.expiredCount, 1);
});

test('phân bổ FEFO: ưu tiên lô hết hạn sớm nhất, báo thiếu nếu tồn không đủ', () => {
  const today = '2026-07-16';
  const lots = [
    { id: 'A', code: 'LOT-A', crop: 'Chanh dây', qtyIn: 300, qtyOut: 0, expiryDate: '2026-08-01' },
    { id: 'B', code: 'LOT-B', crop: 'Chanh dây', qtyIn: 400, qtyOut: 0, expiryDate: '2026-07-20' }, // hết hạn sớm hơn
    { id: 'C', code: 'LOT-C', crop: 'Chôm chôm', qtyIn: 999, qtyOut: 0, expiryDate: '2026-07-18' }, // khác mặt hàng
  ];
  const { plan, shortage } = allocateFEFO(lots, 'Chanh dây', 500, today);
  assert.equal(shortage, 0);
  assert.deepEqual(plan, [{ lotId: 'B', code: 'LOT-B', qty: 400 }, { lotId: 'A', code: 'LOT-A', qty: 100 }], 'B trước (cận hạn), rồi A');
  // thiếu hàng
  const r2 = allocateFEFO(lots, 'Chanh dây', 1000, today);
  assert.equal(r2.shortage, 300, 'chỉ có 700 kg chanh dây → thiếu 300');
});

test('FEFO bỏ qua lô quá hạn', () => {
  const today = '2026-07-16';
  const lots = [
    { id: 'X', code: 'LOT-X', crop: 'Chanh dây', qtyIn: 200, qtyOut: 0, expiryDate: '2026-07-01' }, // quá hạn
    { id: 'Y', code: 'LOT-Y', crop: 'Chanh dây', qtyIn: 200, qtyOut: 0, expiryDate: '2026-08-01' },
  ];
  const { plan, shortage } = allocateFEFO(lots, 'Chanh dây', 200, today);
  assert.deepEqual(plan, [{ lotId: 'Y', code: 'LOT-Y', qty: 200 }], 'không dùng lô quá hạn X');
  assert.equal(shortage, 0);
});
