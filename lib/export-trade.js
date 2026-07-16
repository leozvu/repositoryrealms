// v3.19: XUẤT NHẬP KHẨU NÔNG SẢN — hằng số + ràng buộc nghiệp vụ.
// Số liệu đã kiểm chứng qua nghiên cứu (NĐ 38/2026, nghị định thư TQ, APHIS, EU).
// Cái nào theo thời điểm/luật thì để cấu hình được; cái nào là ràng buộc pháp lý thì chặn cứng.

export const MARKETS = {
  CN: 'Trung Quốc',
  EU: 'Liên minh châu Âu',
  US: 'Hoa Kỳ',
  JP: 'Nhật Bản',
  KR: 'Hàn Quốc',
};

export const CROPS = ['Chanh dây', 'Chôm chôm'];

// 🔴 MA TRẬN TIẾP CẬN THỊ TRƯỜNG — ràng buộc pháp lý, chặn cứng.
// true = được phép; false = cấm/chưa có access. Đã kiểm chứng:
// Nhật+Hàn cấm cả 2; chanh dây đi Mỹ chưa có access; chôm chôm đi Mỹ cần chiếu xạ 400 Gy.
export const MARKET_ACCESS = {
  'Chanh dây': { CN: true, EU: true, US: false, JP: false, KR: false },
  'Chôm chôm': { CN: true, EU: true, US: true, JP: false, KR: false },
};

// Trả null nếu được phép, hoặc chuỗi lý do nếu bị chặn.
export function marketBlocked(crop, market) {
  const row = MARKET_ACCESS[crop];
  if (!row) return null; // mặt hàng ngoài danh mục → không chặn (để linh hoạt)
  if (row[market] === false) {
    if (market === 'US' && crop === 'Chanh dây') return 'Chanh dây chưa có phép xuất khẩu chính ngạch sang Mỹ.';
    if (market === 'JP' || market === 'KR') return `${MARKETS[market]} chưa mở cửa cho ${crop} tươi của Việt Nam.`;
    return `${crop} chưa được phép xuất sang ${MARKETS[market] || market}.`;
  }
  return null;
}

// Điều kiện đặc thù cần nhắc khi lập lô (không chặn, chỉ cảnh báo).
export function marketNotes(crop, market) {
  const notes = [];
  if (crop === 'Chôm chôm' && market === 'US') notes.push('Mỹ: bắt buộc chiếu xạ tối thiểu 400 Gy + preclearance từng lô bởi thanh tra APHIS tại VN.');
  if (market === 'CN') notes.push('Trung Quốc: bắt buộc mã vùng trồng (PUC) + mã cơ sở đóng gói (PHC) đã được GACC phê duyệt cho lô này.');
  if (market === 'EU') notes.push('EU: MRL mặc định 0,01 mg/kg nếu không có ngưỡng riêng — kiểm dư lượng thuốc BVTV trước khi xuất.');
  return notes;
}

// 🔴 Container lạnh: chanh dây (7–10°C) và chôm chôm (13–18°C) KHÔNG xếp chung.
export const CROP_TEMP = {
  'Chanh dây': '7–10°C',
  'Chôm chôm': '13–18°C',
};

// Incoterms hợp lệ theo phương thức vận chuyển (FOB/CIF/CFR chỉ đường biển).
export const INCOTERMS_SEA = ['FOB', 'CIF', 'CFR', 'EXW', 'DAP'];
export const INCOTERMS_AIR = ['FCA', 'CPT', 'CIP', 'EXW', 'DAP'];
export function incotermValid(incoterm, mode) {
  const ok = mode === 'AIR' ? INCOTERMS_AIR : INCOTERMS_SEA;
  return ok.includes(incoterm);
}

// Bộ chứng từ theo thị trường. bắt buộc = phải có mới xuất được.
export function requiredDocs(crop, market) {
  const base = [
    { type: 'invoice', label: 'Commercial Invoice', required: true },
    { type: 'packing', label: 'Packing List', required: true },
    { type: 'bl', label: 'Bill of Lading / AWB', required: true },
    { type: 'customs', label: 'Tờ khai hải quan XK', required: true },
    { type: 'phyto', label: 'Giấy kiểm dịch thực vật (Phytosanitary)', required: true },
    { type: 'co', label: 'C/O (Bộ Công Thương cấp)', required: false }, // ưu đãi thuế, không bắt buộc pháp lý
  ];
  if (crop === 'Chôm chôm' && market === 'US') {
    base.push({ type: 'irradiation', label: 'Chứng nhận chiếu xạ 400 Gy', required: true });
  }
  return base;
}

// Hạn xuất trình chứng từ L/C = min(ngày tàu chạy + 21, ngày hết hạn L/C). UCP 600 điều 14(c).
export function presentationDeadline(etd, lcExpiry, days = 21) {
  if (!etd) return lcExpiry || null;
  const d = new Date(etd + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (lcExpiry && lcExpiry < p) return lcExpiry;
  return p;
}

export const SHIPMENT_STATUS = [
  ['draft', 'Nháp'], ['booked', 'Đã book tàu'], ['packing', 'Đang đóng gói'],
  ['customs', 'Thông quan'], ['shipped', 'Đã xuất'], ['delivered', 'Đã giao'], ['paid', 'Đã thanh toán'],
];
export const CODE_STATUS = [
  ['active', 'Hiệu lực'], ['suspended', 'Tạm đình chỉ'], ['revoked', 'Thu hồi'], ['pending', 'Chờ duyệt'],
];
