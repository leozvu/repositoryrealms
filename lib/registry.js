// ============================================================
// RBAC v2.1 — 7 vai trò theo ma trận trong KE-HOACH-ERP-V2.md
// DIRECTOR luôn có toàn quyền (xử lý trong canRead/Write/Delete).
// scope(user) → điều kiện WHERE; sanitize(row, user) → che trường.
// ============================================================
import { hasAny, rolesOf, isDirector } from './perm.js';
import { marketBlocked } from './export-trade.js';

const ALL = ['PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD', 'STAFF']; // + DIRECTOR ngầm định

// v3.16 — LEAD = TRƯỞNG NHÓM MARKETING ≈ PRODUCT LEAD.
// Ở agency, sản phẩm chính là dịch vụ marketing, nên trưởng nhóm marketing cũng là người
// chịu trách nhiệm giao hàng — không chỉ chia việc trong nhóm.
// Trước v3.16 LEAD bị kẹt: chỉ ĐỌC được dự án (không mở/sửa được), không đặt được mốc, và
// KHÔNG THẤY báo giá — tức là không biết đã bán scope gì cho khách mà vẫn phải giao đúng.
// Vô lý nhất: LEAD tạo và TRẢ được phiếu freelancer (payouts) nhưng không nhìn thấy sổ nhà
// cung cấp — tiêu tiền được mà không thấy sổ.
// Nay LEAD ngang PM ở mảng GIAO HÀNG: dự án, mốc, nhà cung cấp, RFQ, đọc báo giá/hợp đồng/danh bạ.
// RANH GIỚI GIỮ NGUYÊN: hóa đơn, thu chi, ngân sách, hoa hồng vẫn của Kế toán.
// (LEAD vốn đã xem được chi phí + biên lợi nhuận dự án qua lib/projectStats — canSeeMoney
//  đã gồm LEAD từ v3.10 — nên họ đã được tin ở mức kinh tế dự án, chỉ không đụng sổ công ty.)

// v3.13: cột được phép lọc qua query string, VD /api/data/timelogs?taskId=abc
// Danh sách trắng — KHÔNG nhận cột tùy ý từ client (tránh dò dữ liệu qua bộ lọc).
// Bộ lọc này chồng LÊN scope(), không thay thế: lọc thêm không nới quyền.
const FILTERABLE = {
  timelogs: ['taskId', 'projectId', 'userId', 'invoiceId'],
  taskcomments: ['taskId'],
  taskevents: ['taskId'],
  tasks: ['projectId', 'assigneeId', 'status', 'phaseId'],
  payouts: ['userId', 'projectId', 'status'],
  milestones: ['projectId'],
  phases: ['projectId'],
  projectmembers: ['projectId', 'userId'],
  invoices: ['clientId', 'projectId', 'status'],
  attendance: ['userId'],
  leaves: ['userId'],
  contacts: ['clientId'],
  doclinks: ['refType', 'refId'],
  areacodes: ['areaId', 'market'],
  shipmentdocs: ['shipmentId'],
  shipments: ['status', 'market'],
  livesessions: ['status', 'hostId', 'platform'],
};
export const filterableOf = resource => FILTERABLE[resource] || [];

// Phase 1: execution metadata chỉ được ghi qua canonical action engine. Generic CRUD
// vẫn sửa nội dung Task ERP gốc nhưng không được tự chế version, blocker, escalation
// hoặc lineage split/merge từ payload trình duyệt.
function withoutTaskExecutionMetadata(data = {}) {
  const {
    queuePosition, workVersion, workType, complexity, blockReason, blockedAt,
    waitingReason, escalationLevel, escalatedAt, parentTaskId, mergedIntoTaskId,
    createdAt, updatedAt, completedAt, workEvents, splitChildren, mergedSources,
    ...businessFields
  } = data;
  return businessFields;
}

export const RESOURCES = {
  clients: {
    model: 'client', read: ALL, write: ['AM'], del: [],
    orderBy: { name: 'asc' },
    // Chỉ AM / PM / Kế toán / GĐ thấy thông tin liên hệ thương mại
    sanitize: (row, user) => hasAny(user, ['AM', 'PM', 'ACCOUNTANT'])
      ? row : { id: row.id, name: row.name, industry: row.industry },
  },
  leads: {
    model: 'lead', read: ['AM'], write: ['AM'], del: [],
    orderBy: { createdAt: 'desc' },
    // AM chỉ thấy lead mình phụ trách hoặc chưa gán; GĐ thấy tất cả
    scope: user => isDirector(user) ? {} : { OR: [{ ownerId: user.id }, { ownerId: null }] },
    // v3.4: tự chia lead chưa gán cho AM đang giữ ít lead mở nhất (bật trong Cài đặt)
    beforeCreate: async (data, user, prisma) => {
      if (data.ownerId || !prisma) return data;
      const row = await prisma.setting.findUnique({ where: { id: 1 } });
      if (!(row && JSON.parse(row.json).autoAssignLeads)) return data;
      const users = await prisma.user.findMany({ where: { status: 'active' } });
      const ams = users.filter(u => rolesOf(u).includes('AM'));
      if (!ams.length) return data;
      const counts = await Promise.all(ams.map(a => prisma.lead.count({ where: { ownerId: a.id, stage: { notIn: ['won', 'lost'] } } })));
      return { ...data, ownerId: ams[counts.indexOf(Math.min(...counts))].id };
    },
  },
  services: {
    model: 'service', read: ALL, write: ['AM'], del: ['AM'],
    orderBy: { name: 'asc' },
  },
  quotes: {
    model: 'quote', read: ['AM', 'PM', 'ACCOUNTANT', 'LEAD'], write: ['AM'], del: [],
    orderBy: { date: 'desc' },
  },
  projects: {
    model: 'project', read: ALL, write: ['PM', 'LEAD'], del: [],
    orderBy: { deadline: 'asc' },
  },
  tasks: {
    model: 'task', read: ALL, write: ALL, del: ['PM', 'LEAD'],
    orderBy: { dueDate: 'asc' },
    // STAFF/AM chỉ sửa task của mình; LEAD sửa task nhóm; PM/GĐ tất cả
    canWriteRow: (row, user) => hasAny(user, ['PM']) || row.assigneeId === user.id
      || (rolesOf(user).includes('LEAD') && row.assigneeId !== null),
    beforeCreate: async (data) => withoutTaskExecutionMetadata(data),
    filterUpdate: (data, user) => {
      const safe = withoutTaskExecutionMetadata(data);
      if (!hasAny(user, ['PM', 'LEAD'])) { const { assigneeId, ...rest } = safe; return rest; }
      return safe;
    },
    // v3.2: chặn chuyển "Hoàn thành" khi việc phụ thuộc chưa xong
    validate: async (row, data, prisma) => {
      if (data.status !== 'done' || row?.status === 'done') return null;
      let ids = []; try { ids = JSON.parse((data.dependsOn ?? row?.dependsOn) || '[]'); } catch {}
      if (!ids.length) return null;
      const deps = await prisma.task.findMany({ where: { id: { in: ids } } });
      const block = deps.filter(t => t.status !== 'done');
      return block.length ? `Chưa thể hoàn thành — còn chờ: ${block.map(t => t.title).join(', ')}` : null;
    },
  },
  // v3.2: mốc dự án trên Gantt
  milestones: {
    model: 'milestone', read: ALL, write: ['PM', 'LEAD'], del: ['PM', 'LEAD'],
    orderBy: { date: 'asc' },
  },
  // v3.4: danh bạ nhiều người liên hệ mỗi khách (thông tin thương mại)
  contacts: {
    model: 'contact', read: ['AM', 'PM', 'ACCOUNTANT', 'LEAD'], write: ['AM'], del: ['AM'],
    orderBy: { primary: 'desc' },
  },
  // v3.8: đánh giá hiệu suất quý — mình thấy của mình; HR/PM/LEAD thấy để chấm
  reviews: {
    model: 'review', read: ALL, write: ALL, del: ['HR'],
    orderBy: { createdAt: 'desc' },
    scope: user => hasAny(user, ['HR', 'PM', 'LEAD']) ? {} : { userId: user.id },
    // v3.13: đánh giá đã chốt thì người được đánh giá không sửa lại được nữa
    canWriteRow: (row, user) => hasAny(user, ['HR', 'PM', 'LEAD'])
      || (row.userId === user.id && row.status !== 'final'),
    // v3.13: nhân viên chỉ tự chấm + tự nhận xét. Không đụng nhận xét quản lý,
    // không tự chốt final, không chuyển đánh giá sang người khác.
    filterUpdate: (data, user) => {
      if (hasAny(user, ['HR', 'PM', 'LEAD'])) return data;
      const { mgrNote, status, userId, quarter, ...rest } = data;
      return { ...rest, status: 'self_done' };
    },
  },
  // v3.10: giai đoạn dự án — PM/Lead quản lý, mọi người xem
  phases: {
    model: 'phase', read: ALL, write: ['PM', 'LEAD'], del: ['PM', 'LEAD'],
    orderBy: { order: 'asc' },
  },
  // v3.10: lịch sử công việc — chỉ đọc (ghi tự động qua event bus)
  taskevents: {
    model: 'taskEvent', read: ALL, write: [], del: [],
    orderBy: { at: 'desc' },
  },
  // v3.11: thành viên dự án (gắn freelancer/nhân sự vào dự án)
  projectmembers: {
    model: 'projectMember', read: ['PM', 'LEAD', 'HR', 'AM'], write: ['PM', 'LEAD', 'HR'], del: ['PM', 'LEAD', 'HR'],
    orderBy: { createdAt: 'desc' },
  },
  // v3.12: công nợ thanh toán freelancer — PM/Lead/HR/Kế toán
  payouts: {
    model: 'payout', read: ['PM', 'LEAD', 'HR', 'ACCOUNTANT'], write: ['PM', 'LEAD', 'HR', 'ACCOUNTANT'], del: ['ACCOUNTANT', 'PM'],
    orderBy: { createdAt: 'desc' },
    // v3.13: phiếu đã trả là chứng từ kế toán (đã sinh phiếu chi) — khóa, không sửa/xóa nữa
    canWriteRow: row => row.status !== 'paid',
    // v3.13: status/paidDate CHỈ được đặt qua /api/payouts/[id]/pay — route đó mới ghi phiếu chi
    // vào sổ quỹ. Cho sửa thẳng ở đây = đánh dấu đã trả mà tiền không hề ra sổ.
    // userId khóa luôn: không đổi người nhận sau khi đã chốt.
    filterUpdate: data => { const { status, paidDate, userId, ...rest } = data; return rest; },
  },
  // v3.11: ngày lễ công ty — HR quản lý, mọi người xem
  holidays: {
    model: 'holiday', read: ALL, write: ['HR'], del: ['HR'],
    orderBy: { date: 'asc' },
  },
  // v3.10: mẫu dự án — PM/Lead/GĐ quản lý
  projecttemplates: {
    model: 'projectTemplate', read: ['PM', 'LEAD', 'AM'], write: ['PM', 'LEAD'], del: ['PM', 'LEAD'],
    orderBy: { name: 'asc' },
  },
  // v3.7: bình luận trao đổi trên công việc — ai cũng đọc/ghi, chỉ sửa của mình
  taskcomments: {
    model: 'taskComment', read: ALL, write: ALL, del: ALL,
    orderBy: { createdAt: 'asc' },
    beforeCreate: (data, user) => ({ ...data, userId: user.id }),
    canWriteRow: (row, user) => row.userId === user.id,
  },
  // v3.5: link tài liệu ngoài (Drive/Notion/Figma) gắn vào dự án/khách/hợp đồng
  doclinks: {
    model: 'docLink', read: ALL, write: ALL, del: ALL,
    orderBy: { createdAt: 'desc' },
    // v3.13: ai gắn link người đó sửa (hoặc AM/PM/GĐ). Link trong ERP được đồng nghiệp
    // tin sẵn — để ai cũng sửa được URL là mở đường trỏ sang trang giả mạo.
    canWriteRow: (row, user) => hasAny(user, ['AM', 'PM']) || row.addedBy === user.id,
    beforeCreate: (data, user) => ({ ...data, addedBy: user.id }),
  },
  // v3.5: RFQ so giá NCC + onboarding nhân sự mới
  rfqs: {
    model: 'rfq', read: ['ACCOUNTANT', 'PM', 'LEAD'], write: ['ACCOUNTANT', 'PM', 'LEAD'], del: ['ACCOUNTANT', 'PM', 'LEAD'],
    orderBy: { createdAt: 'desc' },
  },
  onboardings: {
    model: 'onboarding', read: ['HR'], write: ['HR'], del: ['HR'],
    orderBy: { createdAt: 'desc' },
  },
  // v3.3: webhook + rule tự động — chỉ Giám đốc
  webhooks: {
    model: 'webhook', read: [], write: [], del: [],
    orderBy: { createdAt: 'desc' },
  },
  rules: {
    model: 'rule', read: [], write: [], del: [],
    orderBy: { createdAt: 'desc' },
  },
  // v3.3: CSAT theo ticket — ai xử lý ticket cũng ghi được
  csat: {
    model: 'csatResponse', read: ALL, write: ALL, del: ['AM'],
    orderBy: { date: 'desc' },
  },
  timelogs: {
    model: 'timeLog', read: ALL, write: ALL, del: ALL,
    orderBy: { date: 'desc' },
    // Own → LEAD thấy nhóm → PM/Kế toán/HR/GĐ thấy tất cả
    scope: user => {
      if (hasAny(user, ['PM', 'ACCOUNTANT', 'HR'])) return {};
      if (rolesOf(user).includes('LEAD') && user.teamId) return { user: { teamId: user.teamId } };
      return { userId: user.id };
    },
    canWriteRow: (row, user) => hasAny(user, ['PM']) || row.userId === user.id,
    beforeCreate: (data, user) => hasAny(user, ['PM', 'LEAD', 'HR']) ? data : { ...data, userId: user.id },
  },
  invoices: {
    model: 'invoice', read: ['ACCOUNTANT', 'AM'], write: ['ACCOUNTANT'], del: [],
    orderBy: { date: 'desc' },
  },
  transactions: {
    model: 'transaction', read: ['ACCOUNTANT'], write: ['ACCOUNTANT'], del: [],
    orderBy: { date: 'desc' },
  },
  vendors: {
    model: 'vendor', read: ['ACCOUNTANT', 'PM', 'LEAD'], write: ['ACCOUNTANT', 'PM', 'LEAD'], del: [],
    orderBy: { name: 'asc' },
  },
  vendorbills: {
    model: 'vendorBill', read: ['ACCOUNTANT', 'PM', 'LEAD'], write: ['ACCOUNTANT', 'PM', 'LEAD'], del: [],
    orderBy: { date: 'desc' },
  },
  contracts: {
    model: 'contract', read: ['ACCOUNTANT', 'AM', 'PM', 'LEAD'], write: ['ACCOUNTANT'], del: [],
    orderBy: { endDate: 'asc' },
  },
  leaves: {
    model: 'leave', read: ALL, write: ALL, del: ['HR'],
    orderBy: { from: 'desc' },
    // Feedback Egoric 07/2026: dữ liệu thật từng có đơn "Nghỉ phép -3 ngày" (đến < từ) —
    // chặn ngay ở API cho mọi đường vào (UI, API mở, automation).
    validate: async (row, data) => {
      const from = data.from ?? row?.from, to = data.to ?? row?.to;
      if (from && to && String(to) < String(from)) return 'Ngày kết thúc nghỉ phép phải từ ngày bắt đầu trở đi';
      return null;
    },
    scope: user => {
      if (hasAny(user, ['HR'])) return {};
      if (rolesOf(user).includes('LEAD') && user.teamId) return { OR: [{ userId: user.id }, { user: { teamId: user.teamId } }] };
      return { userId: user.id };
    },
    beforeCreate: (data, user) => hasAny(user, ['HR']) ? { ...data, status: data.status || 'pending' } : { ...data, userId: user.id, status: 'pending' },
    // Trạng thái chỉ đổi qua máy phê duyệt (hoặc HR/GĐ)
    filterUpdate: (data, user) => {
      if (!hasAny(user, ['HR'])) { const { status, ...rest } = data; return rest; }
      return data;
    },
  },
  teams: {
    model: 'team', read: ALL, write: ['HR'], del: [],
    orderBy: { name: 'asc' },
  },
  users: {
    model: 'user', read: ALL, write: [], del: [],
    // v3.13: writeVia = CRUD chung TỪ CHỐI ghi, kể cả Giám đốc. Trước đây chỉ ghi chú
    // "ghi qua /api/users riêng" mà không có gì chặn: canWrite luôn cho Giám đốc qua nên
    // GĐ vẫn PUT /api/data/users/<id> được với bất kỳ trường nào — kể cả passwordHash dạng
    // thô (khóa luôn tài khoản người đó) — bỏ qua hết kiểm tra của /api/users
    // (băm mật khẩu, độ dài tối thiểu, kiểm vai trò).
    writeVia: '/api/users',
    orderBy: { name: 'asc' },
    sanitize: (row, user) => {
      // v3.13: bóc luôn totpSecret. Trước đây chỉ bóc passwordHash, nên bí mật 2FA của
      // MỌI người (kể cả Giám đốc) lộ ra cho bất kỳ ai gọi /api/data/users — ai cũng
      // sinh được mã 2FA của người khác, coi như 2FA vô nghĩa.
      // loginFails/lockedUntil là chuyện nội bộ chống dò mật khẩu, không cần lộ.
      const { passwordHash, totpSecret, loginFails, lockedUntil, ...safe } = row;
      safe.has2fa = !!totpSecret; // chỉ cần biết CÓ bật hay không, không cần biết mã
      if (isDirector(user) || hasAny(user, ['HR', 'ACCOUNTANT']) || row.id === user.id) return safe;
      const { salary, ...pub } = safe;
      return pub;
    },
  },
  assets: {
    model: 'asset', read: ALL, write: ['HR'], del: [],
    orderBy: { name: 'asc' },
    sanitize: (row, user) => {
      if (hasAny(user, ['HR', 'ACCOUNTANT'])) return row;
      const { price, ...pub } = row;
      return pub;
    },
  },
  activities: {
    model: 'activity', read: ['AM'], write: ['AM'], del: ['AM'],
    orderBy: { date: 'asc' },
  },
  attendance: {
    model: 'attendance', read: ALL, write: ALL, del: ['HR'],
    orderBy: { date: 'desc' },
    // v3.13: Lead chỉ thấy chấm công NHÓM MÌNH — lọc ở server. Trước đây trả {} (cả công ty)
    // rồi phó mặc client lọc, nên gọi thẳng API là lộ giờ vào/ra + OT của toàn bộ nhân viên.
    scope: async (user, prisma) => {
      if (hasAny(user, ['HR'])) return {};
      if (rolesOf(user).includes('LEAD') && user.teamId) {
        const mates = await prisma.user.findMany({ where: { teamId: user.teamId }, select: { id: true } });
        return { userId: { in: [...new Set([...mates.map(m => m.id), user.id])] } };
      }
      return { userId: user.id };
    },
    beforeCreate: (data, user) => hasAny(user, ['HR']) ? data : { ...data, userId: user.id },
    canWriteRow: (row, user) => hasAny(user, ['HR']) || row.userId === user.id,
    // v3.13: tự chấm công không được gán bản ghi sang người khác
    filterUpdate: (data, user) => {
      if (hasAny(user, ['HR'])) return data;
      const { userId, ...rest } = data;
      return rest;
    },
  },
  candidates: {
    model: 'candidate', read: ['HR'], write: ['HR'], del: ['HR'],
    orderBy: { createdAt: 'desc' },
  },
  budgets: {
    model: 'budget', read: ['ACCOUNTANT'], write: ['ACCOUNTANT'], del: ['ACCOUNTANT'],
    orderBy: { category: 'asc' },
  },
  recurringexpenses: {
    model: 'recurringExpense', read: ['ACCOUNTANT'], write: ['ACCOUNTANT'], del: ['ACCOUNTANT'],
    orderBy: { createdAt: 'desc' },
  },
  okrs: {
    model: 'okr', read: ALL, write: ALL, del: ['HR', 'PM'],
    orderBy: { quarter: 'desc' },
    // Ai cũng cập nhật tiến độ OKR của mình; tạo/sửa mục tiêu người khác cần PM/HR/GĐ
    canWriteRow: (row, user) => hasAny(user, ['PM', 'HR']) || row.userId === user.id || row.userId === null,
  },
  nps: {
    model: 'npsResponse', read: ['AM', 'PM'], write: ['AM'], del: ['AM'],
    orderBy: { date: 'desc' },
  },
  commissions: {
    model: 'commission', read: ['ACCOUNTANT', 'AM', 'PM'], write: ['ACCOUNTANT'], del: ['ACCOUNTANT'],
    orderBy: { month: 'desc' },
    // AM chỉ xem hoa hồng của mình; ACCOUNTANT/GĐ thấy tất cả
    scope: user => hasAny(user, ['ACCOUNTANT']) ? {} : { userId: user.id },
  },
  tickets: {
    model: 'ticket', read: ALL, write: ALL, del: ['AM', 'PM'],
    orderBy: { createdAt: 'desc' },
  },
  audit: {
    model: 'auditLog', read: [], write: [], del: [], // chỉ DIRECTOR
    orderBy: { at: 'desc' },
  },

  // ===== v3.19: Xuất nhập khẩu (phân hệ 'export' — Fretas) =====
  // PM = vận hành lô hàng/chứng từ · ACCOUNTANT = giá trị/thanh toán · AM = bán hàng cho buyer.
  growingareas: {
    model: 'growingArea', read: ['PM', 'ACCOUNTANT', 'AM'], write: ['PM', 'ACCOUNTANT'], del: ['PM', 'ACCOUNTANT'],
    orderBy: { createdAt: 'desc' },
  },
  areacodes: {
    model: 'areaCode', read: ['PM', 'ACCOUNTANT', 'AM'], write: ['PM', 'ACCOUNTANT'], del: ['PM', 'ACCOUNTANT'],
    orderBy: { market: 'asc' },
  },
  shipments: {
    model: 'shipment', read: ['PM', 'ACCOUNTANT', 'AM'], write: ['PM', 'ACCOUNTANT', 'AM'], del: ['PM', 'ACCOUNTANT'],
    orderBy: { createdAt: 'desc' },
    // v3.21: chặn cứng thị trường cấm Ở SERVER (không chỉ ở trình duyệt). Lô hàng đi thị trường
    // chưa mở cửa là vi phạm pháp luật XNK — không được để lọt qua API trực tiếp.
    validate: (row, data) => {
      const crop = data.crop ?? row?.crop;
      const market = data.market ?? row?.market;
      return marketBlocked(crop, market);
    },
  },
  shipmentdocs: {
    model: 'shipmentDoc', read: ['PM', 'ACCOUNTANT', 'AM'], write: ['PM', 'ACCOUNTANT', 'AM'], del: ['PM', 'ACCOUNTANT'],
    orderBy: { type: 'asc' },
  },

  // ===== v3.24: Kho hàng / Lô (phân hệ 'inventory' — Fretas) =====
  // PM = vận hành kho (nhập/xuất) · ACCOUNTANT = giá vốn/giá trị tồn. Xuất kho vào lô hàng
  // đi qua /api/stocklots/[id]/issue (writeVia) để cập nhật qtyOut atomic + ghi StockMove.
  stocklots: {
    model: 'stockLot', read: ['PM', 'ACCOUNTANT', 'AM'], write: ['PM', 'ACCOUNTANT'], del: ['PM', 'ACCOUNTANT'],
    orderBy: { createdAt: 'desc' },
    // qtyOut chỉ được đổi qua route xuất kho (không cho sửa tay lệch với StockMove).
    filterUpdate: d => { const { qtyOut, ...rest } = d; return rest; },
  },
  // StockMove là bản ghi kiểm toán: chỉ sinh qua /api/stocklots/[id]/issue (route ghi prisma
  // trực tiếp, không qua canWrite). write:[] chặn người thường tạo tay qua CRUD (khỏi lệch qtyOut);
  // del:[] = chỉ Giám đốc xóa (sửa sai hiếm gặp). Lô đã có move thì KHÔNG cho xóa (giữ truy xuất).
  stockmoves: {
    model: 'stockMove', read: ['PM', 'ACCOUNTANT', 'AM'], write: [], del: [],
    orderBy: { createdAt: 'desc' },
  },

  // ===== v3.20: Livestream (phân hệ 'livestream' — Egolive) =====
  // LEAD = trưởng nhóm live (vận hành ca) · ACCOUNTANT = đối soát/tiền · AM = quan hệ nhãn hàng.
  livesessions: {
    model: 'liveSession', read: ['LEAD', 'ACCOUNTANT', 'AM', 'PM'], write: ['LEAD', 'ACCOUNTANT', 'PM'], del: ['LEAD', 'ACCOUNTANT'],
    orderBy: { date: 'desc' },
  },
  violations: {
    model: 'violation', read: ['LEAD', 'ACCOUNTANT', 'AM', 'PM'], write: ['LEAD', 'ACCOUNTANT', 'PM'], del: ['LEAD', 'ACCOUNTANT'],
    orderBy: { occurredAt: 'desc' },
  },
};

export function canRead(res, user) { const c = RESOURCES[res]; return !!c && (isDirector(user) || hasAny(user, c.read)); }
// v3.13: writeVia chặn TUYỆT ĐỐI (kể cả Giám đốc) — resource đó có route ghi riêng với
// kiểm tra riêng, để CRUD chung ghi vào là lách hết. Khác với write: [] nghĩa là
// "chỉ Giám đốc" (webhooks/rules dùng nghĩa này).
export function canWrite(res, user) { const c = RESOURCES[res]; return !!c && !c.writeVia && (isDirector(user) || hasAny(user, c.write)); }
export function canDelete(res, user) { const c = RESOURCES[res]; return !!c && !c.writeVia && (isDirector(user) || hasAny(user, c.del)); }
