// v3.13: test tính tiền chứng từ + parse dữ liệu JSON-trong-TEXT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItems, parseStrict, itemsTotal, docGrand, paidOf, remainOf, nextCode, hourRate, money } from '../lib/format.js';

test('parseItems: nuốt lỗi trả [] (dùng cho chỗ chỉ hiển thị)', () => {
  assert.deepEqual(parseItems('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(parseItems(null), []);
  assert.deepEqual(parseItems('hỏng'), []);
});

test('parseStrict: JSON hỏng trả null để nơi gọi biết mà báo lỗi', () => {
  assert.deepEqual(parseStrict('[{"amount":1000}]'), [{ amount: 1000 }]);
  assert.deepEqual(parseStrict(null), [], 'rỗng là hợp lệ — nghĩa là chưa có gì');
  assert.deepEqual(parseStrict(''), []);
  assert.equal(parseStrict('[{"amount":1000,,,HỎNG'), null);
  assert.equal(parseStrict('[{"amount":100'), null);
  assert.equal(parseStrict('hỏng hoàn toàn'), null);
  assert.equal(parseStrict('{"khong":"phai mang"}'), null, 'không phải mảng cũng là hỏng');
});

test('parseStrict vs parseItems: khác nhau đúng ở chỗ nguy hiểm', () => {
  const hong = '[{"amount":5000000},,,';
  assert.deepEqual(parseItems(hong), [], 'im lặng coi như chưa thu gì → ghi đè mất lịch sử');
  assert.equal(parseStrict(hong), null, 'báo lỗi để dừng lại');
});

test('tổng tiền chứng từ: cộng dòng rồi cộng VAT', () => {
  const doc = { items: JSON.stringify([{ qty: 2, price: 1000000 }, { qty: 3, price: 500000 }]), vat: 8 };
  assert.equal(itemsTotal(doc), 3500000);
  assert.equal(docGrand(doc), Math.round(3500000 * 1.08));
});

test('tổng tiền: dữ liệu hỏng thì ra 0 chứ không nổ', () => {
  assert.equal(itemsTotal({ items: 'hỏng' }), 0);
  assert.equal(docGrand({ items: 'hỏng', vat: 8 }), 0);
  assert.equal(docGrand({ items: '[]' }), 0);
});

test('đã thu / còn lại', () => {
  const inv = {
    items: JSON.stringify([{ qty: 1, price: 10000000 }]), vat: 0,
    payments: JSON.stringify([{ amount: 3000000 }, { amount: 2000000 }]),
  };
  assert.equal(paidOf(inv), 5000000);
  assert.equal(remainOf(inv), 5000000);
});

test('còn lại không bao giờ âm (thu quá tay)', () => {
  const inv = { items: JSON.stringify([{ qty: 1, price: 1000000 }]), vat: 0, payments: JSON.stringify([{ amount: 9000000 }]) };
  assert.equal(remainOf(inv), 0);
});

test('nextCode: lấy MAX số đuôi, không sort chuỗi', () => {
  const nam = new Date().getFullYear();
  // "INV-CU-003" là hàng thật nhập từ bản cũ — sort chuỗi sẽ cho "CU" > "2026" và sinh mã trùng
  const list = [{ code: 'INV-2026-006' }, { code: 'INV-CU-003' }, { code: 'INV-2026-001' }];
  assert.equal(nextCode('INV', list), `INV-${nam}-007`);
});

test('nextCode: danh sách rỗng thì bắt đầu từ 001', () => {
  const nam = new Date().getFullYear();
  assert.equal(nextCode('BG', []), `BG-${nam}-001`);
  assert.equal(nextCode('BG', null), `BG-${nam}-001`);
});

test('lương giờ = lương tháng ÷ 176 (khớp với cách tính OT)', () => {
  assert.equal(hourRate(22000000), 125000);
  assert.equal(hourRate(0), 0);
  assert.equal(hourRate(null), 0);
});

test('định dạng tiền thống nhất toàn app', () => {
  assert.equal(money(1234567), '1.234.567 ₫');
  assert.equal(money(0), '0 ₫');
  assert.equal(money(null), '0 ₫');
});
