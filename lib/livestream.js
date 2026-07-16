// v3.20: LIVESTREAM — hằng số + logic đối soát. Đã kiểm chứng qua nghiên cứu.

export const PLATFORMS = { tiktok: 'TikTok Shop', shopee: 'Shopee Live' };
export const CONTRACT_TYPES = {
  affiliate: 'Hoa hồng affiliate',
  booking: 'Thuê ca (booking)',
  revshare: 'Ăn chia % GMV',
  kpi: 'KPI cam kết',
};
export const SESSION_STATUS = [
  ['scheduled', 'Đã lên lịch'], ['live', 'Đang live'], ['done', 'Xong ca'], ['reconciled', 'Đã đối soát'],
];

// 🔴 GMV ≠ doanh thu. Chuỗi bào mòn: GMV sóng → (−hủy/hoàn) netGmv → (−phí sàn −thuế) tiền thực nhận.
// Phí sàn TikTok/Shopee ~23–24% (tham khảo, cấu hình được). Thuế NĐ 117/2025 sàn khấu trừ thay.
export const DEFAULT_PLATFORM_FEE_PCT = 23;

// Tính các mốc đối soát từ GMV sóng + số liệu hoàn/phí đã biết.
export function reconcile({ gmv, netGmv, platformFee, taxWithheld }) {
  const g = +gmv || 0;
  const net = netGmv != null && netGmv > 0 ? +netGmv : g; // chưa đối soát thì tạm lấy = GMV sóng
  const fee = +platformFee || 0;
  const tax = +taxWithheld || 0;
  return {
    gmv: g,
    netGmv: net,
    refunded: Math.max(0, g - net),
    platformFee: fee,
    taxWithheld: tax,
    netReceived: Math.max(0, net - fee - tax),
  };
}

// Watch GPM = GMV / 1000 view. RPV = GMV / unique viewer. AOV = GMV / đơn.
export const watchGPM = s => (s.uniqueViewers ? Math.round((s.gmv || 0) / s.uniqueViewers * 1000) / 1000 * 1000 : 0);
export const aov = s => (s.orders ? Math.round((s.gmv || 0) / s.orders) : 0);

// Công host: tạm ứng theo GMV SÓNG, quyết toán theo GMV RÒNG (sau đối soát).
// Nếu tính % trên GMV sóng mà tiền sàn về theo GMV ròng, team gánh rủi ro hoàn đơn.
export function hostPay(s) {
  const base = +s.hostPayBase || 0;
  const rate = +s.hostPayRate || 0;
  const advance = base + Math.round((s.gmv || 0) * rate / 100); // tạm ứng theo sóng
  const settled = base + Math.round((s.netGmv || s.gmv || 0) * rate / 100); // quyết toán theo ròng
  return { advance, settled, clawback: Math.max(0, advance - settled) };
}

// Điểm vi phạm: rolling 180 ngày. 12=cấm mega sale, 24=đình chỉ đăng SP, 36=hạn chế live, 48=đóng shop.
export const VIOLATION_THRESHOLDS = [
  { at: 12, label: 'Cấm tham gia mega sale (7 ngày)' },
  { at: 24, label: 'Đình chỉ đăng sản phẩm (14 ngày)' },
  { at: 36, label: 'Hạn chế livestream (28 ngày)' },
  { at: 48, label: 'Đóng shop vĩnh viễn' },
];
export function plus180(date) {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 180);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Tổng điểm CÒN HIỆU LỰC (chưa quá 180 ngày, chưa được gỡ).
export function activePoints(violations, today) {
  return violations
    .filter(v => v.status === 'active' && (!v.expiresAt || v.expiresAt >= today))
    .reduce((s, v) => s + (+v.points || 0), 0);
}
