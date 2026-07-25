// v3.41 (Chương 3) — QUY GOLD THÀNH THƯỞNG TIỀN TRONG BẢNG LƯƠNG.
//
// Công tắc goldPayoutEnabled MẶC ĐỊNH TẮT. Lý do ghi lại để người sau hiểu:
// nhân sự AIm cảnh báo "quản lý theo hiệu suất phải có một quá trình" — bật quy đổi khi
// dữ liệu chưa đủ dài sẽ ra thưởng lệch và mất niềm tin. Chủ doanh nghiệp bật khi thấy
// Gold đã phản ánh đúng đóng góp.
//
// Ranh giới tính toán (cố ý):
//   - Chỉ tính Gold KIẾM ĐƯỢC trong tháng (amount > 0). Gold tiêu ở Tavern không trừ
//     vào thưởng — tiêu Gold là chuyện trải nghiệm, không phải phạt tiền.
//   - Có TRẦN mỗi người mỗi tháng: chặn lỗi cấu hình biến thành hóa đơn lương khổng lồ.
//   - Thưởng Gold cộng vào "bonus" của phiếu lương → chịu thuế TNCN như mọi khoản thưởng
//     khác (đúng luật, không tạo thu nhập ngoài sổ).

export const GOLD_PAYOUT_DEFAULTS = Object.freeze({
  goldPayoutEnabled: false,
  goldToVndRate: 1000,
  goldMonthlyCapVnd: 2_000_000,
});

export function goldPayoutSettings(settings = {}) {
  const positive = (value, fallback, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
  };
  return {
    enabled: settings.goldPayoutEnabled === true && settings.goldEnabled === true,
    rate: positive(settings.goldToVndRate, GOLD_PAYOUT_DEFAULTS.goldToVndRate, 100_000),
    monthlyCap: positive(settings.goldMonthlyCapVnd, GOLD_PAYOUT_DEFAULTS.goldMonthlyCapVnd, 100_000_000),
  };
}

/* Tính tiền thưởng từ Gold kiếm được trong tháng.
   goldEarned: tổng amount > 0 của người đó trong tháng.
   → { gold, amount, capped } — amount đã làm tròn xuống 1.000đ cho đẹp phiếu lương. */
export function goldBonusFor(goldEarned, settings = {}) {
  const config = goldPayoutSettings(settings);
  if (!config.enabled) return { gold: 0, amount: 0, capped: false };
  const gold = Math.max(0, Math.floor(Number(goldEarned) || 0));
  const raw = gold * config.rate;
  const capped = raw > config.monthlyCap;
  const amount = Math.floor(Math.min(raw, config.monthlyCap) / 1000) * 1000;
  return { gold, amount, capped };
}
