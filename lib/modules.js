// v3.17: BẬT/TẮT PHÂN HỆ THEO CÔNG TY.
// Một codebase phục vụ nhiều mô hình kinh doanh (agency, xuất nhập khẩu, livestream).
// Mỗi công ty bật đúng phân hệ mình cần trong Cài đặt — Fretas không thấy "Gantt/Freelancer",
// Egoric không thấy "Vùng trồng/Chứng từ XNK".
//
// Cách hoạt động:
// - Mỗi mục menu (và mỗi resource) gắn 1 `mod`. Mục KHÔNG có mod = LÕI, luôn bật, không tắt được.
// - Setting.modules = mảng các mod đang bật. THIẾU khóa này (3 công ty cũ) = coi như BẬT HẾT,
//   nên nâng cấp không đổi hành vi công ty hiện tại.
// - Preset để bật nhanh theo loại hình.

// Các nhóm phân hệ tắt được. Thứ tự = thứ tự hiện trong Cài đặt.
export const MODULE_GROUPS = [
  { mod: 'sales', label: 'Bán hàng / CRM', desc: 'Khách tiềm năng, báo giá / proforma — dùng cho cả agency lẫn tìm người mua (buyer) XNK' },
  { mod: 'services', label: 'Bảng giá dịch vụ', desc: 'Danh mục dịch vụ bán theo gói — đặc thù agency, DN xuất khẩu hàng hóa KHÔNG cần' },
  { mod: 'support', label: 'Chăm sóc khách hàng', desc: 'Ticket hỗ trợ + SLA' },
  { mod: 'tasks', label: 'Bảng công việc', desc: 'Kanban giao việc nội bộ (không cần dự án) — mọi loại hình đều dùng: chuẩn bị chứng từ, theo dõi việc, nhắc hạn' },
  { mod: 'delivery', label: 'Vận hành dự án', desc: 'Dự án, Gantt, chấm công giờ, mẫu dự án, nguồn lực — cho mô hình BÁN THEO DỰ ÁN (agency). Bảng công việc tách riêng ở trên.' },
  { mod: 'commissions', label: 'Hoa hồng', desc: 'Hoa hồng sales / host theo doanh số' },
  { mod: 'procurement', label: 'Mua hàng / Nhà cung cấp', desc: 'Nhà cung cấp, phiếu chi NCC, hợp đồng, so giá (RFQ)' },
  { mod: 'freelancers', label: 'Freelancer', desc: 'Quản lý freelancer + thanh toán theo job/ca' },
  { mod: 'recruitment', label: 'Tuyển dụng', desc: 'Tuyển dụng + onboarding' },
  { mod: 'reviews', label: 'Đánh giá hiệu suất', desc: 'Đánh giá nhân sự theo quý' },
  { mod: 'analytics', label: 'Analytics nâng cao', desc: 'MRR / LTV / CAC — hợp mô hình dịch vụ định kỳ' },
  // Phân hệ đặc thù (v3.19–3.20):
  { mod: 'export', label: 'Xuất nhập khẩu', desc: 'Vùng trồng (PUC/PHC), lô hàng, chứng từ XNK, đa tiền tệ — cho DN xuất khẩu nông sản' },
  { mod: 'livestream', label: 'Livestream bán hàng', desc: 'Ca live, đối soát sàn TikTok/Shopee (GMV ròng), công host, điểm vi phạm' },
];

// Preset — bật nhanh theo loại hình công ty.
export const MODULE_PRESETS = {
  agency: { label: 'Agency Marketing', mods: ['sales', 'services', 'support', 'tasks', 'delivery', 'commissions', 'procurement', 'freelancers', 'recruitment', 'reviews', 'analytics'] },
  export: { label: 'Xuất nhập khẩu nông sản', mods: ['sales', 'tasks', 'procurement', 'recruitment', 'export'] },
  livestream: { label: 'Livestream bán hàng', mods: ['tasks', 'commissions', 'freelancers', 'reviews', 'livestream'] },
};

// v3.21: phân hệ chuyên biệt — MẶC ĐỊNH TẮT cho công ty chưa cấu hình (opt-in).
// Nếu không có cái này, 3 công ty agency (modules=null) sẽ tự dưng thấy menu XNK + Livestream.
// Các phân hệ agency cũ (sales/delivery/…) vẫn mặc định BẬT khi null → công ty cũ không đổi.
export const DEFAULT_OFF = ['export', 'livestream'];

// Có bật phân hệ `mod` không? modules = Setting.modules (mảng | undefined).
// mod rỗng/null = lõi → luôn bật. modules chưa cấu hình (null/undefined) = bật các phân hệ
// agency cũ, TẮT phân hệ chuyên biệt. Có mảng → chỉ bật đúng cái trong mảng.
export function modOn(mod, modules) {
  if (!mod) return true;
  if (!Array.isArray(modules)) return !DEFAULT_OFF.includes(mod);
  return modules.includes(mod);
}

// v3.21: resource nào thuộc phân hệ nào — để guard API (defense-in-depth). Resource không
// có trong bảng này = lõi, không bao giờ bị chặn theo module. Phân hệ TẮT → API /api/data/*
// của resource đó trả 403, không chỉ ẩn menu.
export const RESOURCE_MOD = {
  leads: 'sales', quotes: 'sales', services: 'services',
  tickets: 'support',
  tasks: 'tasks', taskcomments: 'tasks', taskevents: 'tasks',
  projects: 'delivery', milestones: 'delivery', phases: 'delivery', timelogs: 'delivery',
  projecttemplates: 'delivery', projectmembers: 'delivery',
  commissions: 'commissions',
  vendors: 'procurement', vendorbills: 'procurement', rfqs: 'procurement',
  payouts: 'freelancers',
  candidates: 'recruitment', onboardings: 'recruitment',
  reviews: 'reviews',
  growingareas: 'export', areacodes: 'export', shipments: 'export', shipmentdocs: 'export',
  livesessions: 'livestream', violations: 'livestream',
};
export const resourceMod = resource => RESOURCE_MOD[resource] || null;
