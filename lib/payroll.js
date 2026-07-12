// Tính lương Việt Nam (đơn giản hóa, đủ dùng cho agency nhỏ):
// - BHXH+BHYT+BHTN người lao động: 10.5% lương cơ bản
// - BH phía công ty: 21.5% lương cơ bản
// - Giảm trừ gia cảnh bản thân: 11.000.000đ/tháng (chưa tính người phụ thuộc)
// - Thuế TNCN lũy tiến 7 bậc trên thu nhập tính thuế
export const INS_EMPLOYEE = 0.105;
export const INS_EMPLOYER = 0.215;
export const PERSONAL_DEDUCTION = 11000000;

export function progressiveTax(taxable) {
  if (taxable <= 0) return 0;
  const brackets = [
    [5000000, 0.05], [10000000, 0.10], [18000000, 0.15],
    [32000000, 0.20], [52000000, 0.25], [80000000, 0.30], [Infinity, 0.35],
  ];
  let tax = 0, prev = 0;
  for (const [cap, rate] of brackets) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, cap) - prev) * rate;
    prev = cap;
  }
  return Math.round(tax);
}

// line vào: {userId, name, base, allowance, bonus} → ra đủ các khoản
export function computeLine(l) {
  const base = +l.base || 0, allowance = +l.allowance || 0, bonus = +l.bonus || 0;
  const insurance = Math.round(base * INS_EMPLOYEE);
  const taxable = Math.max(0, base + bonus - insurance - PERSONAL_DEDUCTION);
  const tax = progressiveTax(taxable);
  const net = base + allowance + bonus - insurance - tax;
  const employerCost = base + allowance + bonus + Math.round(base * INS_EMPLOYER);
  return { userId: l.userId, name: l.name, base, allowance, bonus, insurance, taxable, tax, net, employerCost };
}
