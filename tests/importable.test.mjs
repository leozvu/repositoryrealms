// v3.28: test nhập liệu hàng loạt. Ép kiểu + kiểm lỗi sai là ghi rác vào DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMPORTABLE, EXPORT_ONLY, validateRow, parseIntVnd, splitRows, toCSV } from '../lib/importable.js';

test('parseIntVnd: bỏ dấu phân tách nghìn + ký hiệu tiền', () => {
  assert.equal(parseIntVnd('1.000.000'), 1000000);
  assert.equal(parseIntVnd('1,000,000₫'), 1000000);
  assert.equal(parseIntVnd('  25000 '), 25000);
  assert.equal(parseIntVnd('-500'), -500);
  assert.equal(parseIntVnd(''), null);
  assert.equal(parseIntVnd('abc'), null);
});

test('validateRow: bắt buộc thiếu → lỗi; ô trống không bắt buộc → bỏ qua', () => {
  const f = IMPORTABLE.clients.fields;
  const a = validateRow({ name: '', phone: '090' }, f);
  assert.ok(a.errors.some(e => e.includes('Tên khách hàng')), 'thiếu tên → lỗi');
  const b = validateRow({ name: 'Cty A', phone: '' }, f);
  assert.equal(b.errors.length, 0);
  assert.equal(b.data.name, 'Cty A');
  assert.ok(!('phone' in b.data), 'ô trống không đưa vào data');
});

test('validateRow: ép số + kiểm enum + kiểm ngày', () => {
  const f = IMPORTABLE.transactions.fields;
  const ok = validateRow({ type: 'Income', amount: '5.000.000', date: '2026-07-17', desc: 'test' }, f);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.data.type, 'income', 'enum không phân biệt hoa thường');
  assert.equal(ok.data.amount, 5000000, 'số bỏ dấu chấm');
  assert.equal(ok.data.date, '2026-07-17');

  const badType = validateRow({ type: 'thu', amount: '100', date: '2026-07-17' }, f);
  assert.ok(badType.errors.some(e => e.includes('Loại')), 'enum sai → lỗi');
  const badDate = validateRow({ type: 'expense', amount: '100', date: '17/07/2026' }, f);
  assert.ok(badDate.errors.some(e => e.includes('Ngày')), 'ngày sai định dạng → lỗi');
  const badNum = validateRow({ type: 'expense', amount: 'nhiều', date: '2026-07-17' }, f);
  assert.ok(badNum.errors.some(e => e.includes('Số tiền')), 'số sai → lỗi');
});

test('validateRow: leads enum stage + giá trị số', () => {
  const f = IMPORTABLE.leads.fields;
  const r = validateRow({ name: 'A', value: '80,000,000', stage: 'WON' }, f);
  assert.equal(r.errors.length, 0);
  assert.equal(r.data.value, 80000000);
  assert.equal(r.data.stage, 'won');
});

test('splitRows: ưu tiên TAB (dán Excel), fallback dấu phẩy; bỏ dòng trống', () => {
  const tsv = 'Tên\tSĐT\nCty A\t090\nCty B\t091\n';
  const r = splitRows(tsv);
  assert.deepEqual(r[0], ['Tên', 'SĐT']);
  assert.equal(r.length, 3);
  const csv = 'a,b\n1,2';
  assert.deepEqual(splitRows(csv)[1], ['1', '2']);
});

test('toCSV: có BOM, escape dấu phẩy/ngoặc kép/xuống dòng', () => {
  const fields = [{ key: 'name', label: 'Tên' }, { key: 'note', label: 'Ghi chú' }];
  const csv = toCSV([{ name: 'Cty A, B', note: 'có "trích"' }, { name: 'Cty C', note: 'dòng\nhai' }], fields);
  assert.ok(csv.startsWith('﻿'), 'có BOM để Excel đọc UTF-8');
  const lines = csv.slice(1).split('\n');
  assert.equal(lines[0], 'Tên,Ghi chú');
  assert.equal(lines[1], '"Cty A, B","có ""trích"""', 'phẩy + ngoặc kép được bọc/nhân đôi');
  assert.ok(csv.includes('"dòng\nhai"'), 'xuống dòng trong ô được bọc ngoặc kép');
});

test('EXPORT_ONLY: cột tính sẵn (get) — tổng hóa đơn gồm VAT + còn lại', () => {
  const inv = EXPORT_ONLY.invoices;
  const row = { code: 'HD-1', items: JSON.stringify([{ qty: 2, price: 1000000 }]), vat: 8, payments: JSON.stringify([{ amount: 1000000 }]) };
  const csv = toCSV([row], inv.fields);
  const cells = csv.slice(1).split('\n')[1].split(',');
  // tổng = 2×1tr ×1.08 = 2.160.000; đã thu 1tr; còn 1.160.000
  assert.ok(csv.includes('2160000'), 'tổng gồm VAT');
  assert.ok(csv.includes('1160000'), 'còn lại đúng');
});

test('whitelist KHÔNG chứa tài nguyên nhạy cảm (users/payouts/…)', () => {
  for (const k of ['users', 'payouts', 'invoices', 'shipments', 'livesessions']) {
    assert.ok(!IMPORTABLE[k], `${k} KHÔNG được cho import hàng loạt`);
  }
});
