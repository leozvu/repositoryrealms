// v3.42 (cụm Lead) — NHẬN LEAD TỰ ĐỘNG TỪ MỌI NGUỒN + CHIA SALE THÔNG MINH.
//
// Bối cảnh: trước đây lead nhập tay, và cơ chế chia duy nhất là "giao cho AM đang ít lead
// nhất". Thực tế agency cần chia theo khu vực (Bắc/Trung/Nam), theo mảng dịch vụ, theo
// chiến dịch, hoặc luân phiên vòng tròn. File này là phần thuần logic — không đụng DB,
// không đụng mạng — nên kiểm thử được từng nhánh.
//
// Ranh giới an toàn: endpoint nhận lead là CÔNG KHAI (Facebook/TikTok/landing gọi vào),
// nên mọi thứ ở đây phải phòng thủ: giới hạn độ dài, lọc ký tự, chuẩn hóa số điện thoại,
// và KHÔNG bao giờ tin trường nào từ payload ngoài danh sách cho phép.

export const LEAD_SOURCES = Object.freeze([
  'Facebook', 'Instagram', 'TikTok', 'Zalo', 'Website', 'Landing Page', 'Giới thiệu', 'Khác',
]);

export const ASSIGN_STRATEGIES = Object.freeze({
  LEAST_LOAD: 'least_load',   // ai đang ít lead mở nhất (hành vi cũ — vẫn là mặc định)
  ROUND_ROBIN: 'round_robin', // luân phiên đều tay
  REGION: 'region',           // theo khu vực khách
  SERVICE_LINE: 'service_line', // theo mảng dịch vụ
  CAMPAIGN: 'campaign',       // theo chiến dịch marketing
});

export class LeadIntakeError extends Error {
  constructor(message, status = 400, code = 'lead_intake_invalid') {
    super(message);
    this.name = 'LeadIntakeError';
    this.status = status;
    this.code = code;
  }
}

const text = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/* Chuẩn hóa số điện thoại Việt Nam về dạng 0xxxxxxxxx.
   Cần thiết vì cùng một người có thể tới từ Facebook dạng +84912…, từ landing dạng
   0912…, từ TikTok dạng 84912… — không chuẩn hóa thì chống trùng vô nghĩa. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  let local = digits.replace(/^\+/, '');
  if (local.startsWith('840')) local = local.slice(3);        // +8409… (sai chuẩn nhưng hay gặp)
  else if (local.startsWith('84')) local = local.slice(2);    // +8491…
  else if (local.startsWith('0')) local = local.slice(1);     // 0912…
  if (!/^\d{9,10}$/.test(local)) return null;
  return `0${local}`;
}

export const normalizeEmail = (value) => {
  const email = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{3,120}$/.test(email) ? email : null;
};

/* Chuẩn hóa payload từ mọi nguồn về một hình dạng duy nhất.
   Chấp nhận nhiều tên trường vì mỗi nền tảng gọi một kiểu (full_name / name / ho_ten…). */
export function normalizeLeadPayload(input = {}) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = input[key];
      if (value !== undefined && value !== null && String(value).trim()) return value;
    }
    return null;
  };
  const phone = normalizePhone(pick('phone', 'phone_number', 'sdt', 'so_dien_thoai', 'mobile'));
  const email = normalizeEmail(pick('email', 'email_address', 'mail'));
  if (!phone && !email) {
    throw new LeadIntakeError('Lead phải có ít nhất số điện thoại hoặc email.', 400, 'lead_intake_no_contact');
  }
  const name = text(pick('name', 'full_name', 'ho_ten', 'fullname', 'ten'), 120)
    || (phone ? `Khách ${phone.slice(-4)}` : email.split('@')[0]);
  const rawSource = text(pick('source', 'platform', 'nguon'), 40);
  const source = LEAD_SOURCES.find(s => s.toLowerCase() === rawSource.toLowerCase()) || (rawSource ? 'Khác' : 'Khác');
  return {
    name,
    phone,
    email,
    company: text(pick('company', 'cong_ty', 'business'), 120) || null,
    source,
    // nhãn chiến dịch giữ nguyên dạng người marketing đặt (VD "4_MKT_Landing_ThaoVietAn")
    campaign: text(pick('campaign', 'campaign_name', 'chien_dich', 'utm_campaign', 'form_name'), 100) || null,
    region: text(pick('region', 'khu_vuc', 'province', 'tinh_thanh', 'city'), 60) || null,
    serviceLine: text(pick('serviceLine', 'service', 'mang_dich_vu', 'san_pham', 'product'), 60) || null,
    note: text(pick('note', 'message', 'ghi_chu', 'noi_dung'), 500) || null,
    value: Math.max(0, Math.min(Number(pick('value', 'gia_tri')) || 0, 100_000_000_000)),
  };
}

/* Khóa chống trùng: cùng số điện thoại (hoặc email) trong CÙNG chiến dịch = một lead.
   Cố ý không chặn theo mỗi số điện thoại: một khách quan tâm 2 chiến dịch khác nhau ở 2
   thời điểm là 2 cơ hội thật, chặn hết sẽ mất khách. */
export function leadDedupeKey(lead) {
  const contact = lead.phone || lead.email || '';
  return `${contact}|${(lead.campaign || '').toLowerCase()}`.slice(0, 190);
}

/* Chọn người phụ trách theo chiến lược công ty cấu hình.
   candidates: [{ id, name, regions?: [], serviceLines?: [], campaigns?: [], openLeads, lastAssignedAt }]
   Trả về id, hoặc null nếu không có ai phù hợp (lead để trống chờ chia tay). */
export function pickOwner(lead, candidates = [], { strategy = ASSIGN_STRATEGIES.LEAST_LOAD } = {}) {
  const pool = candidates.filter(c => c && c.id);
  if (!pool.length) return null;

  // Ba chiến lược "theo thuộc tính": lọc trước theo khớp, không ai khớp thì rơi về ít-tải-nhất
  const matchBy = {
    [ASSIGN_STRATEGIES.REGION]: (c) => (c.regions || []).some(r => r && lead.region && r.toLowerCase() === lead.region.toLowerCase()),
    [ASSIGN_STRATEGIES.SERVICE_LINE]: (c) => (c.serviceLines || []).some(s => s && lead.serviceLine && s.toLowerCase() === lead.serviceLine.toLowerCase()),
    [ASSIGN_STRATEGIES.CAMPAIGN]: (c) => (c.campaigns || []).some(k => k && lead.campaign && lead.campaign.toLowerCase().includes(k.toLowerCase())),
  }[strategy];

  const matched = matchBy ? pool.filter(matchBy) : pool;
  const effective = matched.length ? matched : pool; // không ai khớp → cả đội, không bỏ rơi lead

  if (strategy === ASSIGN_STRATEGIES.ROUND_ROBIN) {
    // người lâu chưa nhận nhất; chưa từng nhận thì ưu tiên nhất
    return [...effective].sort((a, b) =>
      (a.lastAssignedAt ? Date.parse(a.lastAssignedAt) : 0) - (b.lastAssignedAt ? Date.parse(b.lastAssignedAt) : 0)
      || String(a.id).localeCompare(String(b.id)),
    )[0].id;
  }
  // mặc định + phần đuôi của 3 chiến lược thuộc tính: ai đang ít lead mở nhất
  return [...effective].sort((a, b) =>
    (a.openLeads || 0) - (b.openLeads || 0) || String(a.id).localeCompare(String(b.id)),
  )[0].id;
}

export function normalizeAssignStrategy(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.values(ASSIGN_STRATEGIES).includes(key) ? key : ASSIGN_STRATEGIES.LEAST_LOAD;
}
