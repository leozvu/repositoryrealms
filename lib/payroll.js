// Monthly resident-wage PIT, selected by the declared tax/payment period.
// This is still a simplified payroll calculation, not a statutory payroll engine:
// insurance uses the existing flat base-salary rates without contribution ceilings;
// allowance is treated as exempt and the OT premium exemption is not classified.
// No current-date lookup: callers with a payroll period must pass that period.
export const INS_EMPLOYEE = 0.105;
export const INS_EMPLOYER = 0.215;
// Compatibility export for historical/no-period callers. New code uses rules below.
export const PERSONAL_DEDUCTION = 11000000;
// v3.13: giờ công chuẩn 1 tháng — dùng để quy lương tháng ra lương giờ (khớp hourRate
// trong lib/format.js dùng cho chi phí dự án, để 2 nơi không ra 2 con số khác nhau).
export const MONTH_HOURS = 176;

// Official sources checked 2026-09-08:
// Cục Thuế 1296/CT-NVT: 2025 retains 11m/4.4m and 7 bands; from 01/01/2026
// resident wages use 15.5m/6.2m and 5 bands (the July general effective date does
// not defer resident-wage rules until July).
// https://xaydungchinhsach.chinhphu.vn/huong-dan-quyet-toan-thue-thu-nhap-ca-nhan-doi-voi-thu-nhap-tu-tien-luong-tien-cong-119260306092819051.htm
// Law 109/2025/QH15, Articles 8–10,29; consolidated 112/VBHN-VPQH:
// https://xaydungchinhsach.chinhphu.vn/cach-tinh-thue-thu-nhap-ca-nhan-tu-tien-luong-tien-cong-119260623094516526.htm
const freezeRules = rules => Object.freeze({ ...rules, brackets: Object.freeze(rules.brackets.map(row => Object.freeze(row))) });
export const PAYROLL_TAX_RULES = Object.freeze({
  legacy: freezeRules({
    version: 'vn_resident_wage_pit_2020_2025_v1', fromYear: 2020,
    personalDeduction: 11000000, dependentDeductionPerPerson: 4400000,
    brackets: [[5000000, .05], [10000000, .10], [18000000, .15], [32000000, .20], [52000000, .25], [80000000, .30], [Infinity, .35]],
  }),
  current: freezeRules({
    version: 'vn_resident_wage_pit_2026_v1', fromYear: 2026,
    personalDeduction: 15500000, dependentDeductionPerPerson: 6200000,
    brackets: [[10000000, .05], [30000000, .10], [60000000, .20], [100000000, .30], [Infinity, .35]],
  }),
});

export class PayrollCalculationError extends Error {
  constructor(code, message) { super(message); this.name = 'PayrollCalculationError'; this.code = code; }
}

/** YYYY-MM, YYYY, year number, or { year, month }. Undefined is labelled legacy. */
export function getPayrollTaxRules(period) {
  const legacyFallback = period === undefined;
  let normalized = legacyFallback ? '2025' : period;
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    const { year, month } = normalized;
    normalized = month === undefined ? String(year) : `${year}-${String(month).padStart(2, '0')}`;
  } else if (typeof normalized === 'number' && Number.isInteger(normalized)) normalized = String(normalized);
  if (typeof normalized !== 'string' || !/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(normalized)) {
    throw new PayrollCalculationError('payroll_invalid_period', 'Kỳ tính thuế phải là năm hoặc tháng YYYY-MM hợp lệ.');
  }
  const taxYear = Number(normalized.slice(0, 4));
  if (taxYear < 2020) throw new PayrollCalculationError('payroll_unsupported_period', 'Chưa có quy tắc tính thuế cho kỳ trước năm 2020.');
  const rules = taxYear >= 2026 ? PAYROLL_TAX_RULES.current : PAYROLL_TAX_RULES.legacy;
  return { ...rules, taxYear, taxPeriod: legacyFallback ? null : normalized, periodSource: legacyFallback ? 'legacy_2025_default' : 'declared_period' };
}

export function progressiveTax(taxable, period) {
  const { brackets } = getPayrollTaxRules(period);
  taxable = Number(taxable);
  if (!Number.isFinite(taxable)) throw new PayrollCalculationError('payroll_invalid_taxable', 'Thu nhập tính thuế phải là số hữu hạn.');
  if (taxable <= 0) return 0;
  let tax = 0, prev = 0;
  for (const [cap, rate] of brackets) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, cap) - prev) * rate;
    prev = cap;
  }
  return Math.round(tax);
}

// line vào: {userId, name, base, allowance, bonus, otHours, lateCount, offDays} → ra đủ các khoản
//
// v3.13 — TIỀN LÀM THÊM (OT). Trước đây hàm này chỉ nhận base/allowance/bonus và KHÔNG
// hề đọc chấm công, dù README v3.11 và trang Chấm công đều ghi "nối vào Bảng lương" và
// Cài đặt có ô "Hệ số lương OT" (ô đó chưa từng được đọc ở đâu). HR phải tự tính OT ngoài
// hệ thống rồi nhét vào ô thưởng. Nay:
//   tiền OT = giờ OT × (lương cơ bản ÷ 176) × hệ số OT (lấy từ Cài đặt, mặc định 1.5)
// Đi muộn / ngày nghỉ chỉ hiển thị để HR biết, KHÔNG tự trừ tiền (theo quyết định của Leoz:
// chấm công có thể sai, tự trừ lương dễ gây tranh cãi).
// Bảo hiểm vẫn tính trên lương cơ bản, không tính trên OT.
export function computeLine(l, otRate = 1.5, period) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) throw new PayrollCalculationError('payroll_invalid_line', 'Dòng lương không hợp lệ.');
  const linePeriod = l.taxPeriod ?? (l.year !== undefined || l.taxYear !== undefined
    ? { year: l.taxYear ?? l.year, ...(l.month !== undefined ? { month: l.month } : {}) }
    : l.month);
  // The API's stored payroll month wins over any client-submitted line metadata.
  const rules = getPayrollTaxRules(period === undefined ? linePeriod : period);
  const dependents = Number(l.dependents ?? 0);
  if (typeof l.dependents === 'boolean' || !Number.isSafeInteger(dependents) || dependents < 0 || !Number.isSafeInteger(dependents * rules.dependentDeductionPerPerson)) {
    throw new PayrollCalculationError('payroll_invalid_dependents', 'Số người phụ thuộc đủ điều kiện phải là số nguyên không âm hợp lệ.');
  }
  const dependentDeduction = dependents * rules.dependentDeductionPerPerson;
  const base = +l.base || 0, allowance = +l.allowance || 0, bonus = +l.bonus || 0;
  const otHours = Math.max(0, +l.otHours || 0);
  const rate = +l.otRate || +otRate || 1.5;
  const otPay = Math.round(otHours * (base / MONTH_HOURS) * rate);
  const insurance = Math.round(base * INS_EMPLOYEE);
  const taxable = Math.max(0, base + bonus + otPay - insurance - rules.personalDeduction - dependentDeduction);
  const tax = progressiveTax(taxable, rules.taxYear);
  const net = base + allowance + bonus + otPay - insurance - tax;
  const employerCost = base + allowance + bonus + otPay + Math.round(base * INS_EMPLOYER);
  return {
    userId: l.userId, name: l.name, base, allowance, bonus,
    otHours, otRate: rate, otPay,
    lateCount: +l.lateCount || 0, offDays: +l.offDays || 0, // chỉ để xem, không ảnh hưởng tiền
    // v3.41: minh bạch nguồn thưởng — nhân sự đối chiếu được "bao nhiêu Gold ra bao nhiêu tiền".
    // Hai trường này CHỈ để hiển thị; tiền đã nằm trong bonus ở trên, không cộng thêm lần nữa.
    goldEarned: +l.goldEarned || 0, goldBonus: +l.goldBonus || 0,
    dependents, personalDeduction: rules.personalDeduction,
    dependentDeductionPerPerson: rules.dependentDeductionPerPerson, dependentDeduction,
    taxYear: rules.taxYear, taxPeriod: rules.taxPeriod, taxPeriodSource: rules.periodSource,
    calculationVersion: rules.version, taxBracketCount: rules.brackets.length,
    calculationScope: 'resident_monthly_wages_simplified_insurance_allowance_ot',
    insurance, taxable, tax, net, employerCost,
  };
}

export function computePayrollLines(lines, otRate, period) {
  if (!Array.isArray(lines)) throw new PayrollCalculationError('payroll_invalid_lines', 'Danh sách dòng lương không hợp lệ.');
  if (period === undefined) throw new PayrollCalculationError('payroll_invalid_period', 'Bảng lương cần có kỳ tính thuế.');
  getPayrollTaxRules(period);
  return lines.map(line => computeLine(line, otRate, period));
}

/** Reading historical rows never recalculates them; drafts need an explicit refresh. */
export function payrollNeedsTaxRecalculation(lines, period) {
  const rules = getPayrollTaxRules(period);
  return !Array.isArray(lines) || lines.some(line => !line
    || line.calculationVersion !== rules.version || line.taxPeriod !== rules.taxPeriod);
}
