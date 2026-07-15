// Tính lương Việt Nam (đơn giản hóa, đủ dùng cho agency nhỏ):
// - BHXH+BHYT+BHTN người lao động: 10.5% lương cơ bản
// - BH phía công ty: 21.5% lương cơ bản
// - Giảm trừ gia cảnh bản thân: 11.000.000đ/tháng (chưa tính người phụ thuộc)
// - Thuế TNCN lũy tiến 7 bậc trên thu nhập tính thuế
export const INS_EMPLOYEE = 0.105;
export const INS_EMPLOYER = 0.215;
export const PERSONAL_DEDUCTION = 11000000;
// v3.13: giờ công chuẩn 1 tháng — dùng để quy lương tháng ra lương giờ (khớp hourRate
// trong lib/format.js dùng cho chi phí dự án, để 2 nơi không ra 2 con số khác nhau).
export const MONTH_HOURS = 176;

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
export function computeLine(l, otRate = 1.5) {
  const base = +l.base || 0, allowance = +l.allowance || 0, bonus = +l.bonus || 0;
  const otHours = Math.max(0, +l.otHours || 0);
  const rate = +l.otRate || +otRate || 1.5;
  const otPay = Math.round(otHours * (base / MONTH_HOURS) * rate);
  const insurance = Math.round(base * INS_EMPLOYEE);
  const taxable = Math.max(0, base + bonus + otPay - insurance - PERSONAL_DEDUCTION);
  const tax = progressiveTax(taxable);
  const net = base + allowance + bonus + otPay - insurance - tax;
  const employerCost = base + allowance + bonus + otPay + Math.round(base * INS_EMPLOYER);
  return {
    userId: l.userId, name: l.name, base, allowance, bonus,
    otHours, otRate: rate, otPay,
    lateCount: +l.lateCount || 0, offDays: +l.offDays || 0, // chỉ để xem, không ảnh hưởng tiền
    insurance, taxable, tax, net, employerCost,
  };
}
