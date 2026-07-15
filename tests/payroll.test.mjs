// v3.13: test tính lương. Sai ở đây là trả sai tiền cho người thật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLine, progressiveTax, MONTH_HOURS, INS_EMPLOYEE, INS_EMPLOYER, PERSONAL_DEDUCTION } from '../lib/payroll.js';

test('thuế TNCN: đúng bậc lũy tiến', () => {
  assert.equal(progressiveTax(0), 0);
  assert.equal(progressiveTax(-5000000), 0, 'thu nhập tính thuế âm → không thuế');
  assert.equal(progressiveTax(5000000), 250000, 'bậc 1: 5% của 5tr');
  assert.equal(progressiveTax(10000000), 750000, 'bậc 1 (250k) + bậc 2 (10% của 5tr)');
  // 18tr = 250k + 500k + 15% × 8tr = 1.950.000
  assert.equal(progressiveTax(18000000), 1950000);
});

test('lương cơ bản: bảo hiểm 10.5%, giảm trừ 11tr', () => {
  const l = computeLine({ userId: 'u', name: 'A', base: 20000000 });
  assert.equal(l.insurance, Math.round(20000000 * INS_EMPLOYEE));
  assert.equal(l.taxable, 20000000 - l.insurance - PERSONAL_DEDUCTION);
  assert.equal(l.net, 20000000 - l.insurance - l.tax);
  assert.equal(l.employerCost, 20000000 + Math.round(20000000 * INS_EMPLOYER));
});

test('OT: giờ OT × (lương ÷ 176) × hệ số', () => {
  const base = 22000000;
  const l = computeLine({ userId: 'u', name: 'A', base, otHours: 4 }, 1.5);
  // 22.000.000 / 176 = 125.000 → × 4 × 1.5 = 750.000
  assert.equal(Math.round(base / MONTH_HOURS), 125000);
  assert.equal(l.otPay, 750000);
  assert.equal(l.otRate, 1.5);
});

test('OT: hệ số lấy từ tham số, nhưng dòng đã có otRate thì giữ nguyên', () => {
  // Bảng lương cũ đã chốt hệ số 2.0 → đổi Cài đặt sang 1.5 không được sửa ngược bảng cũ
  const l = computeLine({ userId: 'u', name: 'A', base: 17600000, otHours: 10, otRate: 2 }, 1.5);
  assert.equal(l.otRate, 2);
  assert.equal(l.otPay, 10 * 100000 * 2);
});

test('OT làm tăng thực nhận và chi phí công ty', () => {
  const sach = computeLine({ userId: 'u', name: 'A', base: 14000000, otHours: 0 }, 1.5);
  const co = computeLine({ userId: 'u', name: 'A', base: 14000000, otHours: 10 }, 1.5);
  assert.ok(co.net > sach.net);
  assert.ok(co.employerCost > sach.employerCost);
});

test('bảo hiểm KHÔNG tính trên tiền OT', () => {
  const sach = computeLine({ userId: 'u', name: 'A', base: 14000000, otHours: 0 }, 1.5);
  const co = computeLine({ userId: 'u', name: 'A', base: 14000000, otHours: 20 }, 1.5);
  assert.equal(co.insurance, sach.insurance);
});

test('đi muộn / ngày nghỉ KHÔNG tự trừ tiền (quyết định nghiệp vụ)', () => {
  const sach = computeLine({ userId: 'u', name: 'A', base: 14000000 });
  const te = computeLine({ userId: 'u', name: 'A', base: 14000000, lateCount: 15, offDays: 8 });
  assert.equal(te.net, sach.net, 'chấm công có thể sai — tự trừ lương dễ gây tranh cãi');
  assert.equal(te.lateCount, 15, 'nhưng vẫn giữ số liệu để HR nhìn');
  assert.equal(te.offDays, 8);
});

test('giá trị rác không làm nổ, không sinh tiền âm', () => {
  const l = computeLine({ userId: 'u', name: 'A', base: 'hỏng', otHours: -5, allowance: null, bonus: undefined });
  assert.equal(l.base, 0);
  assert.equal(l.otHours, 0, 'giờ OT âm bị kẹp về 0');
  assert.equal(l.otPay, 0);
  assert.equal(l.net, 0);
  assert.ok(Number.isFinite(l.employerCost));
});

test('thưởng chịu thuế, phụ cấp thì không', () => {
  const base = 20000000;
  const thuong = computeLine({ userId: 'u', name: 'A', base, bonus: 5000000 });
  const phuCap = computeLine({ userId: 'u', name: 'A', base, allowance: 5000000 });
  assert.ok(thuong.tax > phuCap.tax, 'thưởng phải vào thu nhập tính thuế');
  assert.equal(phuCap.taxable, computeLine({ userId: 'u', name: 'A', base }).taxable);
});
