// v3.13: test tính lương. Sai ở đây là trả sai tiền cho người thật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLine, computePayrollLines, getPayrollTaxRules, payrollNeedsTaxRecalculation, progressiveTax, MONTH_HOURS, INS_EMPLOYEE, INS_EMPLOYER, PERSONAL_DEDUCTION } from '../lib/payroll.js';

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

test('2025 keeps every historical band and 2026 uses five monthly marginal bands', () => {
  for (const [income, expected] of [[5000000, 250000], [10000000, 750000], [18000000, 1950000], [32000000, 4750000], [52000000, 9750000], [80000000, 18150000], [100000000, 25150000]]) {
    assert.equal(progressiveTax(income, '2025-12'), expected);
  }
  for (const [income, expected] of [[0, 0], [10000000, 500000], [30000000, 2500000], [60000000, 8500000], [100000000, 20500000], [120000000, 27500000]]) {
    for (const month of ['2026-01', '2026-06', '2026-07', '2026-12']) assert.equal(progressiveTax(income, month), expected, `${month}/${income}`);
  }
});

test('2026 bracket boundaries use the correct rate immediately below and above', () => {
  for (const [cap, atCap, belowRate, aboveRate] of [[10000000, 500000, .05, .10], [30000000, 2500000, .10, .20], [60000000, 8500000, .20, .30], [100000000, 20500000, .30, .35]]) {
    assert.equal(progressiveTax(cap - 100, 2026), atCap - 100 * belowRate);
    assert.equal(progressiveTax(cap + 100, 2026), atCap + 100 * aboveRate);
  }
});

test('December 2025 to January 2026 changes deductions and bands, never insurance or gross pay', () => {
  const old = computeLine({ base: 30000000 }, 1.5, '2025-12');
  const current = computeLine({ base: 30000000 }, 1.5, '2026-01');
  assert.equal(old.taxable, 15850000); assert.equal(old.tax, 1627500);
  assert.equal(current.taxable, 11350000); assert.equal(current.tax, 635000);
  assert.equal(old.insurance, 3150000); assert.equal(current.insurance, old.insurance);
  assert.equal(current.employerCost, old.employerCost);
  assert.equal(current.net - old.net, old.tax - current.tax);
  assert.equal(current.personalDeduction, 15500000); assert.equal(old.personalDeduction, 11000000);
  assert.notEqual(current.calculationVersion, old.calculationVersion);
});

test('eligible dependents use the declared year and clamp taxable income at zero', () => {
  const old = computeLine({ base: 30000000, dependents: 2 }, 1.5, '2025-12');
  const current = computeLine({ base: 30000000, dependents: 2 }, 1.5, '2026-01');
  assert.equal(old.dependentDeduction, 8800000); assert.equal(old.tax, 455000);
  assert.equal(current.dependentDeduction, 12400000); assert.equal(current.taxable, 0); assert.equal(current.tax, 0);
  assert.equal(computeLine({ base: 30000000, dependents: 1 }, 1.5, '2026-01').tax, 257500);
  assert.equal(computeLine({ base: 0, dependents: 3 }, 1.5, '2026-01').net, 0);
  for (const dependents of [-1, 1.5, Infinity, 'bad', true]) assert.throws(() => computeLine({ base: 30000000, dependents }, 1.5, '2026-01'), { code: 'payroll_invalid_dependents' });
});

test('period input is deterministic, validates months, and labels the compatibility fallback', () => {
  assert.equal(getPayrollTaxRules({ year: 2026, month: 1 }).taxPeriod, '2026-01');
  assert.equal(getPayrollTaxRules(2025).taxYear, 2025);
  assert.equal(computeLine({ base: 30000000, month: '2026-03' }).tax, 635000);
  assert.equal(computeLine({ base: 30000000, year: 2026, month: 3 }).taxPeriod, '2026-03');
  assert.equal(computeLine({ base: 30000000 }).taxPeriodSource, 'legacy_2025_default');
  assert.equal(computeLine({ base: 30000000 }).taxYear, 2025);
  for (const period of ['2026-00', '2026-13', '2026-1', '2026-01-01', '', null, {}, { year: 2026, month: 13 }]) assert.throws(() => getPayrollTaxRules(period), { code: 'payroll_invalid_period' });
  assert.throws(() => getPayrollTaxRules('2019-12'), { code: 'payroll_unsupported_period' });
  assert.throws(() => progressiveTax(Infinity, '2026-01'), { code: 'payroll_invalid_taxable' });
});

test('stored payroll period overrides tampered line rules; no implicit current year in batches', () => {
  const [line] = computePayrollLines([{ base: 30000000, taxPeriod: '2025-12', taxYear: 2025, calculationVersion: 'forged', dependents: 1 }], 1.5, '2026-01');
  assert.equal(line.taxPeriod, '2026-01'); assert.equal(line.taxYear, 2026); assert.equal(line.tax, 257500);
  assert.throws(() => computePayrollLines([], 1.5), { code: 'payroll_invalid_period' });
  assert.throws(() => computePayrollLines({}, 1.5, '2026-01'), { code: 'payroll_invalid_lines' });
});

test('recalculation guard preserves historical values and rejects missing/wrong saved rules', () => {
  const old = [{ base: 30000000, tax: 1627500, net: 25222500 }];
  const before = structuredClone(old);
  assert.equal(payrollNeedsTaxRecalculation(old, '2026-01'), true); assert.deepEqual(old, before);
  const current = computePayrollLines([{ base: 30000000 }], 1.5, '2026-01');
  assert.equal(payrollNeedsTaxRecalculation(current, '2026-01'), false);
  assert.equal(payrollNeedsTaxRecalculation(current, '2026-02'), true);
  assert.equal(payrollNeedsTaxRecalculation(current, '2025-12'), true);
});
