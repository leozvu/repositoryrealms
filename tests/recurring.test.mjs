// v3.32: test chi phí định kỳ. Chống trùng (sinh 2 lần/tháng) là điểm dễ sai → ghi trùng phiếu chi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recurTag, genDate, dueTemplates } from '../lib/recurring.js';

test('genDate kẹp ngày 1–28 (tránh lệch tháng)', () => {
  assert.equal(genDate('2026-07', 5), '2026-07-05');
  assert.equal(genDate('2026-02', 31), '2026-02-28', 'ngày 31 → kẹp 28');
  assert.equal(genDate('2026-07', 0), '2026-07-01');
});

test('dueTemplates: chỉ mẫu active + chưa sinh trong tháng', () => {
  const templates = [
    { id: 'a', active: true }, { id: 'b', active: true }, { id: 'c', active: false },
  ];
  const txs = [
    { type: 'expense', date: '2026-07-05', desc: `Thuê VP (định kỳ) ${recurTag('a')}` }, // a đã sinh tháng 7
    { type: 'expense', date: '2026-06-05', desc: `Internet ${recurTag('b')}` },           // b sinh tháng 6, không tính
  ];
  const due = dueTemplates(templates, txs, '2026-07');
  assert.deepEqual(due.map(t => t.id), ['b'], 'a đã sinh, c tắt → chỉ còn b');
});

test('dueTemplates: mẫu chưa từng sinh đều đến hạn', () => {
  const due = dueTemplates([{ id: 'x', active: true }], [], '2026-07');
  assert.equal(due.length, 1);
});
