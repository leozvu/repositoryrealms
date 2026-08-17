// v3.20: LIVESTREAM — hằng số + logic đối soát. Đã kiểm chứng qua nghiên cứu.

export const PLATFORMS = { tiktok: 'TikTok Shop', shopee: 'Shopee Live' };
export const CONTRACT_TYPES = {
  affiliate: 'Hoa hồng affiliate',
  booking: 'Thuê ca (booking)',
  revshare: 'Ăn chia % GMV',
  kpi: 'KPI cam kết',
};
export const SESSION_STATUS = [
  ['scheduled', 'Đã lên lịch'], ['live', 'Đang live'], ['done', 'Xong ca'], ['reconciled', 'Đã đối soát'], ['cancelled', 'Đã hủy'],
];

export const LIVE_SCHEDULE_STATUSES = [
  ['draft', 'Bản nháp'],
  ['confirmed', 'Đã xác nhận'],
];

export const LIVE_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const LIVE_MIN_DURATION_MIN = 30;
export const LIVE_MAX_DURATION_MIN = 13 * 60;

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SCHEDULE_PEOPLE = ['hostId', 'assistantId', 'operatorId', 'moderatorId'];

const minutesOf = value => {
  if (!TIME_RE.test(String(value || ''))) return null;
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
};

export function sessionInterval(session = {}) {
  const start = minutesOf(session.startAt);
  const duration = Number(session.durationMin || 0);
  if (!session.date || start === null || !Number.isFinite(duration) || duration <= 0) return null;
  return { date: String(session.date), start, end: start + duration };
}

function overlapping(a, b) {
  return a.date === b.date && a.start < b.end && b.start < a.end;
}

function assignedPeople(session = {}) {
  return new Set(SCHEDULE_PEOPLE.map((key) => session[key]).filter(Boolean));
}

export function scheduleConflicts(candidate = {}, existingSessions = []) {
  if (candidate.status === 'cancelled') return [];
  const interval = sessionInterval(candidate);
  if (!interval) return [];
  const people = assignedPeople(candidate);
  const studio = String(candidate.studio || '').trim().toLocaleLowerCase('vi');
  const conflicts = [];

  for (const existing of existingSessions || []) {
    if (!existing || existing.id === candidate.id || existing.status === 'cancelled') continue;
    const otherInterval = sessionInterval(existing);
    if (!otherInterval || !overlapping(interval, otherInterval)) continue;
    const otherPeople = assignedPeople(existing);
    const sharedPeople = [...people].filter((id) => otherPeople.has(id));
    if (sharedPeople.length) {
      conflicts.push({ kind: 'person', sessionId: existing.id, people: sharedPeople });
    }
    const otherStudio = String(existing.studio || '').trim().toLocaleLowerCase('vi');
    if (studio && otherStudio && studio === otherStudio) {
      conflicts.push({ kind: 'studio', sessionId: existing.id, studio: existing.studio });
    }
  }
  return conflicts;
}

export function validateLiveSchedule(session = {}) {
  const errors = [];
  const confirmed = session.scheduleStatus === 'confirmed';
  const start = String(session.startAt || '');
  const duration = Number(session.durationMin || 0);
  if (confirmed && !String(session.title || '').trim()) errors.push({ code: 'title_required', field: 'title' });
  if (confirmed && !start) errors.push({ code: 'start_required', field: 'startAt' });
  else if (start && !TIME_RE.test(start)) errors.push({ code: 'start_invalid', field: 'startAt' });
  if (confirmed && !duration) errors.push({ code: 'duration_required', field: 'durationMin' });
  else if (duration && (duration < LIVE_MIN_DURATION_MIN || duration > LIVE_MAX_DURATION_MIN)) {
    errors.push({ code: 'duration_invalid', field: 'durationMin' });
  }
  if (confirmed && !session.hostId) errors.push({ code: 'host_required', field: 'hostId' });
  if (confirmed && !String(session.studio || '').trim()) errors.push({ code: 'studio_required', field: 'studio' });
  if (confirmed && session.platform === 'tiktok' && Number(session.productCount || 0) < 1) {
    errors.push({ code: 'products_required', field: 'productCount' });
  }
  return errors;
}

export function liveScheduleReadiness(session = {}) {
  const items = [
    { key: 'host', ready: Boolean(session.hostId), label: 'Host chính' },
    { key: 'crew', ready: Boolean(session.operatorId || session.moderatorId), label: 'Operator / moderator' },
    { key: 'products', ready: session.platform !== 'tiktok' || Number(session.productCount || 0) > 0, label: 'Danh sách sản phẩm' },
    { key: 'brief', ready: Boolean(String(session.briefUrl || '').trim()), label: 'Kịch bản / brief' },
    { key: 'rehearsal', ready: Boolean(session.rehearsalAt), label: 'Lịch rehearsal' },
  ];
  const missing = items.filter((item) => !item.ready);
  return { ready: missing.length === 0, score: Math.round(((items.length - missing.length) / items.length) * 100), items, missing };
}

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

// v3.27: Khấu trừ TNCN công host tại nguồn. Host thường là freelancer (không hợp đồng lao động)
// → chi trả hoa hồng/ca ≥ 2 triệu/lần phải khấu trừ 10% TNCN tại nguồn (Điều 25 TT111/2013).
// Trả { pit, net }: pit = thuế khấu trừ, net = tiền host thực nhận.
export const PIT_THRESHOLD = 2_000_000; // ngưỡng phải khấu trừ mỗi lần chi
export const PIT_DEFAULT_PCT = 10;
export function hostPit(settled, pct = PIT_DEFAULT_PCT) {
  const s = +settled || 0;
  const p = +pct || 0;
  const pit = s >= PIT_THRESHOLD ? Math.round(s * p / 100) : 0; // dưới ngưỡng không khấu trừ
  return { pit, net: Math.max(0, s - pit) };
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
