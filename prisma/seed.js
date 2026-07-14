/* Seed v3.2: 8 tài khoản (7 vai trò) + bộ dữ liệu demo phủ toàn bộ module.
   Chạy: npm run db:seed
   ⚠ CHỈ DÙNG CHO DEV/DEMO — xóa toàn bộ dữ liệu hiện có rồi seed lại từ đầu.
   Ngày tháng sinh tương đối so với hôm nay để dashboard/AI Summary/aging luôn "sống". */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

/* ---------- Helpers ngày tương đối (local, không UTC) ---------- */
const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const D = n => { const d = new Date(); d.setDate(d.getDate() + n); return localISO(d); };          // hôm nay ± n ngày
const MD = (m, day) => { const d = new Date(); d.setMonth(d.getMonth() + m); d.setDate(day); return localISO(d); }; // tháng ± m, ngày cố định
const M = m => MD(m, 1).slice(0, 7);                                                               // YYYY-MM
const DT = h => new Date(Date.now() + h * 3600000);                                                // DateTime ± h giờ
const Q = () => { const d = new Date(); return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`; };
const J = JSON.stringify;
const grandOf = (items, vat = 8) => Math.round(items.reduce((s, it) => s + it.qty * it.price, 0) * (1 + vat / 100));
// n ngày làm việc gần nhất (bỏ T7/CN), mới → cũ
const workdays = n => {
  const out = []; const d = new Date();
  while (out.length < n) { if (d.getDay() !== 0 && d.getDay() !== 6) out.push(localISO(d)); d.setDate(d.getDate() - 1); }
  return out;
};

async function main() {
  console.log('⚠ Seed v3.2 — xóa toàn bộ dữ liệu cũ và tạo lại bộ demo (chỉ dùng cho dev).');

  /* ---------- Xóa theo thứ tự con → cha ---------- */
  for (const m of ['review', 'taskEvent', 'phase', 'projectTemplate', 'taskComment', 'notification', 'docLink', 'rfq', 'onboarding',
    'contact', 'apiKey', 'webhook', 'rule', 'csatResponse',
    'message', 'convMember', 'conversation', 'auditLog', 'approval', 'commission',
    'npsResponse', 'okr', 'ticket', 'budget', 'payroll', 'candidate', 'attendance', 'activity',
    'timeLog', 'task', 'milestone', 'invoice', 'quote', 'vendorBill', 'transaction', 'leave',
    'project', 'lead', 'contract', 'asset', 'vendor', 'service', 'client', 'user', 'team', 'setting']) {
    await prisma[m].deleteMany();
  }

  /* ---------- Cài đặt công ty ---------- */
  await prisma.setting.create({
    data: {
      id: 1,
      json: J({
        company: 'Aim Agency', address: '68 Nguyễn Huệ, Q.1, TP.HCM', taxCode: '0312345678',
        email: 'hello@aimagency.vn', phone: '028 3823 6868', bank: 'VCB 0071000123456 — CN Sài Gòn',
        invoicePrefix: 'INV', quotePrefix: 'BG', vat: 8, monthlyTarget: 350000000,
        approveQuoteOver: 50000000, approveExpenseOver: 10000000, approveExpenseDirectorOver: 50000000,
        commissionRate: 5,
      }),
    },
  });

  /* ---------- Nhóm + tài khoản (8 tài khoản README + 2 nhân viên phụ) ---------- */
  const teamCreative = await prisma.team.create({ data: { name: 'Nhóm Sáng tạo' } });
  const teamMedia = await prisma.team.create({ data: { name: 'Nhóm Media' } });

  const mk = pw => bcrypt.hashSync(pw, 10);
  const mkUser = d => prisma.user.create({ data: d });
  const giamdoc = await mkUser({ email: 'giamdoc@agency.vn', name: 'Vũ Minh Long', passwordHash: mk('admin123'), role: 'DIRECTOR', roles: J(['DIRECTOR']), title: 'Founder / CEO', salary: 40000000, phone: '0901111222' });
  const ketoan = await mkUser({ email: 'ketoan@agency.vn', name: 'Nguyễn Thu Trang', passwordHash: mk('ketoan123'), role: 'ACCOUNTANT', roles: J(['ACCOUNTANT']), title: 'Kế toán trưởng', salary: 18000000 });
  const am = await mkUser({ email: 'am@agency.vn', name: 'Phạm Hoàng Anh', passwordHash: mk('am123456'), role: 'AM', roles: J(['AM']), title: 'Account Manager', salary: 20000000, phone: '0903334455' });
  const pm = await mkUser({ email: 'pm@agency.vn', name: 'Trần Quốc Việt', passwordHash: mk('pm123456'), role: 'PM', roles: J(['PM']), title: 'Project Manager', salary: 22000000 });
  const hr = await mkUser({ email: 'hr@agency.vn', name: 'Lê Thị Hồng Nhung', passwordHash: mk('hr123456'), role: 'HR', roles: J(['HR']), title: 'HR Executive', salary: 15000000 });
  const lead = await mkUser({ email: 'truongnhom@agency.vn', name: 'Đỗ Văn Khánh', passwordHash: mk('lead1234'), role: 'LEAD', roles: J(['LEAD']), title: 'Trưởng nhóm Sáng tạo', salary: 19000000, teamId: teamCreative.id });
  const bdayThisWeek = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return `1998-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const nhanvien = await mkUser({ email: 'nhanvien@agency.vn', name: 'Lê Thu Hà', passwordHash: mk('nhanvien123'), role: 'STAFF', roles: J(['STAFF']), title: 'Designer', salary: 14000000, teamId: teamCreative.id, birthday: bdayThisWeek });
  const quanly = await mkUser({ email: 'quanly@agency.vn', name: 'Trần Quốc Bảo', passwordHash: mk('quanly123'), role: 'MANAGER', roles: J(['PM', 'AM', 'ACCOUNTANT']), title: 'Quản lý (đa vai trò)', salary: 25000000 });
  const content = await mkUser({ email: 'content@agency.vn', name: 'Ngô Mai Phương', passwordHash: mk('demo1234'), role: 'STAFF', roles: J(['STAFF']), title: 'Content Writer', salary: 12000000, teamId: teamCreative.id });
  const media = await mkUser({ email: 'media@agency.vn', name: 'Bùi Đức Mạnh', passwordHash: mk('demo1234'), role: 'STAFF', roles: J(['STAFF']), title: 'Media Buyer', salary: 13000000, teamId: teamMedia.id });
  await prisma.team.update({ where: { id: teamCreative.id }, data: { leadId: lead.id } });

  /* ---------- Khách hàng (1 khách "nguội" >45 ngày → cảnh báo churn) ---------- */
  const cafe = await prisma.client.create({ data: { name: 'Cà phê Nhà Mình', contact: 'Anh Tuấn', email: 'tuan@nhaminh.cafe', phone: '0908111222', industry: 'F&B', address: 'Q.3, TP.HCM', createdAt: D(-200), note: 'Retainer Fanpage + Ads hàng tháng' } });
  const eva = await prisma.client.create({ data: { name: 'EVA Fashion', contact: 'Chị Vy', email: 'vy@evafashion.vn', phone: '0912345678', industry: 'Thời trang', address: 'Q.1, TP.HCM', createdAt: D(-150), note: 'Khách lớn nhất — BST theo mùa' } });
  const smile = await prisma.client.create({ data: { name: 'Nha khoa Smile Plus', contact: 'Bác sĩ Hùng', email: 'info@smileplus.vn', phone: '0987654321', industry: 'Y tế / Nha khoa', createdAt: D(-90) } });
  const minhphat = await prisma.client.create({ data: { name: 'BĐS Minh Phát', contact: 'Anh Phát', email: 'phat@minhphat.land', phone: '0933222111', industry: 'Bất động sản', createdAt: D(-25), note: 'Khách mới từ lead thắng' } });
  const spa = await prisma.client.create({ data: { name: 'Serenity Spa', contact: 'Chị Hằng', email: 'hang@serenityspa.vn', phone: '0977888999', industry: 'Làm đẹp', createdAt: D(-240), note: 'Ngừng hợp tác từ quý trước — cần tái kết nối' } });

  /* ---------- Danh bạ nhiều người liên hệ (v3.4) ---------- */
  await prisma.contact.createMany({
    data: [
      { clientId: eva.id, name: 'Nguyễn Thảo Vy', role: 'Brand Manager', email: 'vy@evafashion.vn', phone: '0912345678', primary: true },
      { clientId: eva.id, name: 'Trần Đức Tùng', role: 'Kế toán trưởng', email: 'tung.tran@evafashion.vn', phone: '0912999888', note: 'Liên hệ về hóa đơn, công nợ' },
      { clientId: eva.id, name: 'Lê Hải Yến', role: 'Trợ lý Marketing', email: 'yen.le@evafashion.vn' },
      { clientId: cafe.id, name: 'Phạm Anh Tuấn', role: 'Chủ quán', email: 'tuan@nhaminh.cafe', phone: '0908111222', primary: true },
      { clientId: smile.id, name: 'BS. Trần Mạnh Hùng', role: 'Giám đốc phòng khám', email: 'hung@smileplus.vn', phone: '0987654321', primary: true },
      { clientId: minhphat.id, name: 'Đỗ Minh Phát', role: 'Tổng giám đốc', email: 'phat@minhphat.land', phone: '0933222111', primary: true },
      { clientId: minhphat.id, name: 'Vũ Thu Hường', role: 'Thư ký TGĐ', phone: '0933222999', note: 'Đặt lịch họp qua chị Hường' },
    ],
  });

  /* ---------- Leads: đủ 6 giai đoạn, 1 deal ứ đọng >14 ngày, 2 thắng gần đây (CAC) ---------- */
  await prisma.lead.createMany({
    data: [
      { name: 'Chị Quỳnh — chuỗi trà sữa MoMo Tea', company: 'MoMo Tea', email: 'quynh@momotea.vn', phone: '0905123123', source: 'Facebook', value: 60000000, stage: 'new', ownerId: am.id, createdAt: D(-3), expectedClose: D(+45), note: 'Muốn chạy ads khai trương 3 chi nhánh' },
      { name: 'Anh Dũng — Gym Titan', company: 'Titan Fitness', email: 'dung@titanfit.vn', phone: '0918777666', source: 'Website', value: 45000000, stage: 'contacted', ownerId: am.id, createdAt: D(-8), expectedClose: D(+30), note: 'Đã gọi lần 1, hẹn demo tuần sau' },
      { name: 'Chị Lan — Tiệm bánh Mây', company: 'Mây Bakery', email: 'lan@maybakery.vn', phone: '0902555444', source: 'Giới thiệu', value: 90000000, stage: 'proposal', ownerId: am.id, createdAt: D(-20), expectedClose: D(+12), note: 'Đã gửi đề xuất branding + social, chờ phản hồi' },
      { name: 'Anh Sơn — Nội thất SGHome', company: 'SGHome', email: 'son@sghome.vn', phone: '0938666777', source: 'Giới thiệu', value: 150000000, stage: 'negotiation', ownerId: am.id, createdAt: D(-12), expectedClose: D(+8), note: 'Đang thương lượng phạm vi TVC + KOL' },
      { name: 'Anh Phát — BĐS Minh Phát', company: 'BĐS Minh Phát', email: 'phat@minhphat.land', phone: '0933222111', source: 'Website', value: 45000000, stage: 'won', ownerId: am.id, createdAt: D(-30), note: 'Đã ký — chuyển thành khách hàng' },
      { name: 'Chị Vy — EVA Fashion (BST mới)', company: 'EVA Fashion', email: 'vy@evafashion.vn', phone: '0912345678', source: 'Giới thiệu', value: 180000000, stage: 'won', ownerId: am.id, createdAt: D(-50), note: 'Chiến dịch BST Thu Đông' },
      { name: 'Anh Toàn — Cửa hàng điện máy', company: 'Điện máy Toàn Phát', phone: '0909111000', source: 'TikTok', value: 20000000, stage: 'lost', ownerId: am.id, createdAt: D(-45), note: 'Chọn agency giá rẻ hơn' },
    ],
  });

  /* ---------- Bảng giá dịch vụ ---------- */
  await prisma.service.createMany({
    data: [
      { name: 'Quản lý Fanpage', unit: 'tháng', price: 8000000, desc: 'Content + thiết kế + chăm sóc page, 20 bài/tháng' },
      { name: 'Vận hành quảng cáo', unit: 'tháng', price: 15000000, desc: 'Setup + tối ưu Facebook/Google Ads (chưa gồm ngân sách)' },
      { name: 'Bộ nhận diện thương hiệu', unit: 'gói', price: 45000000, desc: 'Logo, guideline, ấn phẩm cơ bản' },
      { name: 'Sản xuất video', unit: 'video', price: 25000000, desc: 'Video 30-60s quay dựng trọn gói' },
      { name: 'Landing page', unit: 'trang', price: 12000000, desc: 'Thiết kế + code + tối ưu chuyển đổi' },
      { name: 'Booking KOL', unit: 'chiến dịch', price: 30000000, desc: 'Lên danh sách, đàm phán, quản lý 5-10 KOL' },
    ],
  });

  /* ---------- Dự án (1 active trễ deadline → insight) ---------- */
  const p1 = await prisma.project.create({ data: { name: 'Chiến dịch BST Thu Đông — EVA', clientId: eva.id, service: 'Ads + KOL + Video', budget: 180000000, budgetHours: 260, status: 'active', startDate: D(-40), deadline: D(+35), progress: 55 } });
  const p2 = await prisma.project.create({ data: { name: 'Retainer Fanpage & Ads — Cà phê Nhà Mình', clientId: cafe.id, service: 'Quản lý Fanpage + Ads', budget: 90000000, budgetHours: 120, status: 'active', startDate: D(-90), deadline: D(+90), progress: 45 } });
  const p3 = await prisma.project.create({ data: { name: 'Website & Landing page — Smile Plus', clientId: smile.id, service: 'Landing page', budget: 60000000, budgetHours: 90, status: 'active', startDate: D(-60), deadline: D(-5), progress: 80 } });

  // v3.10: giai đoạn cho dự án EVA (P1)
  const phEva1 = await prisma.phase.create({ data: { projectId: p1.id, name: 'Concept & Kịch bản', order: 0, color: '#2563EB' } });
  const phEva2 = await prisma.phase.create({ data: { projectId: p1.id, name: 'Sản xuất', order: 1, color: '#7C3AED' } });
  const phEva3 = await prisma.phase.create({ data: { projectId: p1.id, name: 'Phân phối & Ads', order: 2, color: '#059669' } });
  const p4 = await prisma.project.create({ data: { name: 'Bộ nhận diện thương hiệu — Minh Phát', clientId: minhphat.id, service: 'Branding', budget: 45000000, status: 'planning', startDate: D(+7), deadline: D(+60), progress: 0 } });
  await prisma.project.create({ data: { name: 'TVC 30s — EVA', clientId: eva.id, service: 'Sản xuất video', budget: 120000000, status: 'done', startDate: D(-150), deadline: D(-60), progress: 100 } });

  /* ---------- Công việc: đủ 4 cột kanban, 3 việc trễ hạn ---------- */
  // Chuỗi phụ thuộc P1 (v3.2): kịch bản → quay dựng → setup ads (tạo riêng để lấy id)
  const tScript = await prisma.task.create({ data: { title: 'Kịch bản video hero 45s', projectId: p1.id, phaseId: phEva1.id, assigneeId: content.id, priority: 'high', status: 'done', dueDate: D(-18), estHours: 16, labels: J(['Nội dung']) } });
  const tShoot = await prisma.task.create({
    data: {
      title: 'Quay + dựng video hero', projectId: p1.id, phaseId: phEva2.id, assigneeId: lead.id, priority: 'high', status: 'review', dueDate: D(+2), dependsOn: J([tScript.id]), estHours: 40, labels: J(['Sản xuất', 'Video']),
      checklist: J([{ text: 'Quay đủ 3 bối cảnh', done: true }, { text: 'Dựng bản nháp 60s', done: true }, { text: 'Chèn nhạc + màu', done: false }, { text: 'Xuất bản final 45s', done: false }]),
    },
  });
  await prisma.taskComment.createMany({
    data: [
      { taskId: tShoot.id, userId: pm.id, content: 'Khách muốn tone ấm hơn ở cảnh cuối nhé, xem lại bản màu.' },
      { taskId: tShoot.id, userId: lead.id, content: 'Ok anh, chiều nay em gửi bản chỉnh màu v2.' },
    ],
  });
  await prisma.task.create({ data: { title: 'Báo cáo ads tuần gửi khách retainer', projectId: p2.id, assigneeId: media.id, priority: 'medium', status: 'todo', dueDate: D(+2), recur: 'weekly', note: 'Việc định kỳ — xong tự tạo kỳ sau', checklist: J([{ text: 'Tổng hợp số liệu ads', done: false }, { text: 'Viết nhận xét + đề xuất', done: false }]) } });
  await prisma.task.create({ data: { title: 'Setup chiến dịch ads giai đoạn 1', projectId: p1.id, phaseId: phEva3.id, assigneeId: media.id, priority: 'medium', status: 'doing', dueDate: D(+5), dependsOn: J([tShoot.id]), estHours: 20, labels: J(['Ads']), note: 'Chỉ chạy ads sau khi video hero hoàn thành' } });
  await prisma.task.createMany({
    data: [
      // P1 — EVA Thu Đông
      { title: 'Moodboard & concept BST', projectId: p1.id, phaseId: phEva1.id, assigneeId: nhanvien.id, priority: 'high', status: 'done', dueDate: D(-30), estHours: 24, labels: J(['Thiết kế']) },
      { title: 'Thiết kế 12 key visual', projectId: p1.id, phaseId: phEva2.id, assigneeId: nhanvien.id, priority: 'high', status: 'doing', dueDate: D(-2), estHours: 48, labels: J(['Thiết kế']), note: 'Trễ vì chờ ảnh sản phẩm từ khách' },
      { title: 'Chốt danh sách 8 KOL', projectId: p1.id, phaseId: phEva3.id, assigneeId: am.id, priority: 'medium', status: 'todo', dueDate: D(+8), estHours: 12, labels: J(['KOL']) },
      // P2 — retainer Cà phê
      { title: 'Content lịch tháng này (20 bài)', projectId: p2.id, assigneeId: content.id, priority: 'medium', status: 'doing', dueDate: D(+10) },
      { title: 'Thiết kế bộ ảnh menu mới', projectId: p2.id, assigneeId: nhanvien.id, priority: 'medium', status: 'todo', dueDate: D(+12) },
      { title: 'Báo cáo ads tháng trước', projectId: p2.id, assigneeId: media.id, priority: 'low', status: 'done', dueDate: D(-7) },
      { title: 'Tối ưu ngân sách ads tuần này', projectId: p2.id, assigneeId: media.id, priority: 'high', status: 'doing', dueDate: D(-1) },
      // P3 — Smile Plus (dự án trễ)
      { title: 'Code landing page đặt lịch', projectId: p3.id, assigneeId: lead.id, priority: 'high', status: 'review', dueDate: D(-4), note: 'Chờ khách duyệt bản final' },
      { title: 'Viết content 5 trang dịch vụ', projectId: p3.id, assigneeId: content.id, priority: 'medium', status: 'done', dueDate: D(-15) },
      { title: 'Tối ưu tốc độ + SEO onpage', projectId: p3.id, assigneeId: lead.id, priority: 'medium', status: 'todo', dueDate: D(+4) },
      // P4 — Minh Phát
      { title: 'Nghiên cứu thị trường BĐS khu Đông', projectId: p4.id, assigneeId: content.id, priority: 'medium', status: 'todo', dueDate: D(+14) },
      { title: 'Phác thảo 3 hướng logo', projectId: p4.id, assigneeId: nhanvien.id, priority: 'medium', status: 'todo', dueDate: D(+20) },
      // Việc chung
      { title: 'Cập nhật portfolio agency Q3', projectId: null, assigneeId: nhanvien.id, priority: 'low', status: 'todo', dueDate: D(+25) },
      { title: 'Chuẩn bị pitching Mây Bakery', projectId: null, assigneeId: am.id, priority: 'high', status: 'doing', dueDate: D(+3) },
      { title: 'Sắp xếp lại ổ tài liệu chung', projectId: null, assigneeId: content.id, priority: 'low', status: 'todo', dueDate: null },
    ],
  });

  /* ---------- Mốc dự án trên Gantt (v3.2) ---------- */
  await prisma.milestone.createMany({
    data: [
      { projectId: p1.id, name: 'Ký hợp đồng & kickoff', date: D(-38), done: true },
      { projectId: p1.id, name: 'Chốt concept BST', date: D(-25), done: true },
      { projectId: p1.id, name: 'Golive chiến dịch', date: D(+12), done: false, note: 'Đồng bộ video hero + ads + KOL' },
      { projectId: p1.id, name: 'Tổng kết & nghiệm thu', date: D(+33), done: false },
      { projectId: p3.id, name: 'Bàn giao website', date: D(-3), done: false, note: 'Trễ — chờ khách duyệt bản final' },
      { projectId: p4.id, name: 'Duyệt logo final', date: D(+40), done: false },
    ],
  });

  /* ---------- Giờ công: ~12 ngày làm việc gần nhất × 5 người (utilization hợp lý) ---------- */
  const wds = workdays(14);
  const loggers = [nhanvien, content, media, lead, pm];
  const projByUser = { [nhanvien.id]: p1.id, [content.id]: p2.id, [media.id]: p2.id, [lead.id]: p3.id, [pm.id]: p1.id };
  const timeLogs = [];
  wds.forEach((date, di) => loggers.forEach((u, ui) => {
    timeLogs.push({ userId: u.id, projectId: (di + ui) % 3 === 0 ? p1.id : projByUser[u.id], date, hours: 6 + ((di + ui) % 3), billable: (di + ui) % 5 !== 0, note: null });
  }));
  await prisma.timeLog.createMany({ data: timeLogs });

  /* ---------- Báo giá ---------- */
  const bg1Items = [{ desc: 'Chiến dịch BST Thu Đông trọn gói (ads + KOL + video)', qty: 1, price: 180000000 }];
  await prisma.quote.create({ data: { code: 'BG-2026-001', clientId: eva.id, items: J(bg1Items), vat: 8, status: 'accepted', date: D(-48), note: 'Đã chuyển thành dự án + hóa đơn đợt 1' } });
  await prisma.quote.create({ data: { code: 'BG-2026-002', clientId: minhphat.id, items: J([{ desc: 'Bộ nhận diện thương hiệu', qty: 1, price: 45000000 }]), vat: 8, status: 'sent', date: D(-10) } });
  await prisma.quote.create({ data: { code: 'BG-2026-003', clientId: spa.id, items: J([{ desc: 'Gói tái khởi động social 3 tháng', qty: 3, price: 8000000 }]), vat: 8, status: 'draft', date: D(-2), note: 'Đề xuất tái kết nối khách cũ' } });

  /* ---------- Hóa đơn: 2 đã thu, 1 thu 50%, 1 quá hạn, 1 nháp, 1 retainer định kỳ ---------- */
  const inv1Items = [{ desc: 'BST Thu Đông — đợt 1 (50%)', qty: 1, price: 90000000 }];
  const inv1Grand = grandOf(inv1Items);
  const inv1 = await prisma.invoice.create({ data: { code: 'INV-2026-001', clientId: eva.id, projectId: p1.id, items: J(inv1Items), vat: 8, status: 'paid', date: D(-35), dueDate: D(-20), paidDate: D(-22), payments: J([{ id: 'p1', amount: inv1Grand, date: D(-22), note: 'Chuyển khoản VCB' }]) } });

  const retItems = [{ desc: 'Retainer Fanpage + Ads', qty: 1, price: 15000000 }];
  const retGrand = grandOf(retItems);
  const inv2 = await prisma.invoice.create({ data: { code: 'INV-2026-002', clientId: cafe.id, projectId: p2.id, items: J(retItems), vat: 8, status: 'paid', date: MD(-1, 1), dueDate: MD(-1, 10), paidDate: MD(-1, 8), payments: J([{ id: 'p1', amount: retGrand, date: MD(-1, 8), note: 'CK' }]), recurring: true, recGroup: 'RET-CAFE' } });
  await prisma.invoice.create({ data: { code: 'INV-2026-003', clientId: cafe.id, projectId: p2.id, items: J(retItems), vat: 8, status: 'sent', date: MD(0, 1), dueDate: D(+7), payments: '[]', recurring: true, recGroup: 'RET-CAFE' } });

  const inv4Items = [{ desc: 'Website + Landing — đợt 2', qty: 1, price: 40000000 }];
  await prisma.invoice.create({ data: { code: 'INV-2026-004', clientId: smile.id, projectId: p3.id, items: J(inv4Items), vat: 8, status: 'sent', date: D(-30), dueDate: D(-12), payments: '[]' } });

  const inv5Items = [{ desc: 'BST Thu Đông — đợt 2 (30%)', qty: 1, price: 60000000 }];
  const inv5Grand = grandOf(inv5Items);
  const inv5 = await prisma.invoice.create({ data: { code: 'INV-2026-005', clientId: eva.id, projectId: p1.id, items: J(inv5Items), vat: 8, status: 'sent', date: D(-15), dueDate: D(+10), payments: J([{ id: 'p1', amount: Math.round(inv5Grand / 2), date: D(-6), note: 'Tạm ứng 50%' }]) } });

  await prisma.invoice.create({ data: { code: 'INV-2026-006', clientId: minhphat.id, projectId: p4.id, items: J([{ desc: 'Bộ nhận diện — đợt 1 (50%)', qty: 1, price: 22500000 }]), vat: 8, status: 'draft', date: D(-2), dueDate: D(+15), payments: '[]' } });

  // Hóa đơn cũ — nuôi cohort matrix: Spa churn sau 2 tháng, Cà phê retain đều
  const spaItems = [{ desc: 'Gói social + ads tháng', qty: 1, price: 12000000 }];
  const spaGrand = grandOf(spaItems);
  await prisma.invoice.create({ data: { code: 'INV-CU-001', clientId: spa.id, items: J(spaItems), vat: 8, status: 'paid', date: MD(-4, 5), dueDate: MD(-4, 15), paidDate: MD(-4, 12), payments: J([{ id: 'p1', amount: spaGrand, date: MD(-4, 12), note: 'CK' }]) } });
  await prisma.invoice.create({ data: { code: 'INV-CU-002', clientId: spa.id, items: J(spaItems), vat: 8, status: 'paid', date: MD(-3, 5), dueDate: MD(-3, 15), paidDate: MD(-3, 14), payments: J([{ id: 'p1', amount: spaGrand, date: MD(-3, 14), note: 'CK' }]) } });
  await prisma.invoice.create({ data: { code: 'INV-CU-003', clientId: cafe.id, items: J(retItems), vat: 8, status: 'paid', date: MD(-2, 1), dueDate: MD(-2, 10), paidDate: MD(-2, 9), payments: J([{ id: 'p1', amount: retGrand, date: MD(-2, 9), note: 'CK' }]), recurring: true, recGroup: 'RET-CAFE' } });

  /* ---------- Sổ quỹ: 4 tháng thu chi — dòng tiền dương, thu tháng này > cùng kỳ ---------- */
  const tx = [];
  const inc = (amount, date, desc, projectId) => tx.push({ type: 'income', category: 'Doanh thu dịch vụ', amount, date, desc, projectId: projectId || null });
  const exp = (category, amount, date, desc) => tx.push({ type: 'expense', category, amount, date, desc });
  // Thu 3 tháng trước
  inc(160000000, MD(-3, 12), 'TVC EVA — quyết toán'); inc(120000000, MD(-3, 18), 'Chiến dịch hè Serenity Spa'); inc(60000000, MD(-3, 25), 'Website trọn gói khách lẻ');
  inc(150000000, MD(-2, 10), 'Retainer + ads quý khách cũ'); inc(130000000, MD(-2, 22), 'Chiến dịch khai trương SGHome');
  inc(95000000, MD(-1, 4), 'Đợt 2 chiến dịch hè'); inc(retGrand, MD(-1, 8), 'INV-2026-002 — retainer Cà phê Nhà Mình', p2.id); inc(140000000, MD(-1, 18), 'Booking KOL + video khách F&B'); inc(85000000, MD(-1, 26), 'Landing page + ads nha khoa');
  // Thu tháng này (INV-001 thu D(-22) có thể rơi tháng trước tùy ngày chạy — vẫn hợp lệ)
  inc(inv1Grand, D(-22), 'INV-2026-001 — EVA đợt 1', p1.id);
  inc(48600000, D(-9), 'Quyết toán ads tháng trước khách retainer'); inc(Math.round(inv5Grand / 2), D(-6), 'INV-2026-005 — EVA tạm ứng đợt 2', p1.id); inc(150000000, D(-4), 'Quyết toán quý retainer + ads nhóm khách cũ'); inc(45000000, D(-1), 'Phí quản lý chiến dịch Minh Phát');
  // Chi cố định hàng tháng (lương ngày 5, thuê VP ngày 3, tool ngày 6…)
  for (const m of [-3, -2, -1, 0]) {
    exp('Lương nhân sự', 185000000, MD(m, 5), 'Chi lương + BH tháng ' + M(m).slice(5));
    exp('Văn phòng', 15000000, MD(m, 3), 'Thuê văn phòng + điện nước');
    exp('Công cụ / phần mềm', 8500000, MD(m, 6), 'Adobe, Figma, hosting, tool ads');
    exp('Ngân sách quảng cáo', m === 0 ? 32000000 : 28000000, MD(m, 8), 'Ngân sách ads chạy hộ khách + agency');
    exp('Marketing nội bộ', 6000000, MD(m, 15), 'Content + ads tuyển dụng, PR agency');
  }
  exp('Thuế / phí', 24000000, MD(-2, 20), 'VAT quý trước');
  exp('Thanh toán nhà cung cấp', 8000000, D(-10), 'Trả Nhà in Sao Việt — VB-2026-002');
  await prisma.transaction.createMany({ data: tx });

  /* ---------- NCC + hóa đơn đầu vào (1 quá hạn trả → insight) ---------- */
  const vKol = await prisma.vendor.create({ data: { name: 'KOL Hub Agency', type: 'KOL', contact: 'Ms Trân', phone: '0901234567', email: 'tran@kolhub.vn', rating: 4 } });
  const vPrint = await prisma.vendor.create({ data: { name: 'Nhà in Sao Việt', type: 'Nhà in', contact: 'Anh Bảy', phone: '0913579246', rating: 5 } });
  const vStudio = await prisma.vendor.create({ data: { name: 'Chill Studio', type: 'Studio', contact: 'Mr Kha', phone: '0938111333', email: 'kha@chillstudio.vn', rating: 4 } });
  const vFree = await prisma.vendor.create({ data: { name: 'Nguyễn Văn Cường (freelancer)', type: 'Freelancer', phone: '0905888777', rating: 3, note: 'Editor video, hay trễ deadline nhẹ' } });
  await prisma.vendorBill.createMany({
    data: [
      { code: 'VB-2026-001', vendorId: vKol.id, projectId: p1.id, desc: 'Booking 5 KOL đợt 1 — BST Thu Đông', amount: 30000000, date: D(-25), dueDate: D(-6), status: 'pending' },
      { code: 'VB-2026-002', vendorId: vPrint.id, projectId: p2.id, desc: 'In standee + menu Cà phê Nhà Mình', amount: 8000000, date: D(-18), dueDate: D(-8), status: 'paid', paidDate: D(-10) },
      { code: 'VB-2026-003', vendorId: vStudio.id, projectId: p1.id, desc: 'Thuê studio quay video hero 2 ngày', amount: 18000000, date: D(-8), dueDate: D(+15), status: 'approved' },
      { code: 'VB-2026-004', vendorId: vFree.id, projectId: p3.id, desc: 'Dựng 4 video ngắn landing page', amount: 6000000, date: D(-3), dueDate: D(+20), status: 'pending' },
    ],
  });

  /* ---------- Hợp đồng (1 hết hạn trong 30 ngày → insight) ---------- */
  await prisma.contract.createMany({
    data: [
      { code: 'HD-2026-EVA', type: 'client', partner: 'EVA Fashion', value: 300000000, signDate: D(-50), startDate: D(-48), endDate: D(+150), status: 'active', note: 'Hợp đồng khung năm — BST + retainer' },
      { code: 'HD-2026-CAFE', type: 'client', partner: 'Cà phê Nhà Mình', value: 96000000, signDate: D(-95), startDate: D(-90), endDate: D(+20), status: 'active', note: 'Retainer 6 tháng — cần đàm phán gia hạn' },
      { code: 'HD-NCC-KOLHUB', type: 'vendor', partner: 'KOL Hub Agency', value: 60000000, signDate: D(-30), startDate: D(-28), endDate: D(+200), status: 'active' },
      { code: 'HD-2025-SPA', type: 'client', partner: 'Serenity Spa', value: 72000000, signDate: D(-240), startDate: D(-235), endDate: D(-40), status: 'expired', note: 'Đã kết thúc — chưa tái ký' },
    ],
  });

  /* ---------- Tài sản (1 license sắp gia hạn) ---------- */
  await prisma.asset.createMany({
    data: [
      { name: 'MacBook Pro 14" M3', category: 'Laptop / máy tính', serial: 'MBP14-2025-041', holderId: nhanvien.id, price: 45000000, buyDate: D(-300), status: 'in_use' },
      { name: 'Sony A7 IV + lens 24-70', category: 'Thiết bị quay chụp', serial: 'SONY-A74-112', holderId: media.id, price: 75000000, buyDate: D(-400), status: 'in_use' },
      { name: 'Màn hình LG 27" 4K', category: 'Laptop / máy tính', serial: 'LG27-2024-007', holderId: content.id, price: 9000000, buyDate: D(-500), status: 'in_use' },
      { name: 'Adobe Creative Cloud (5 seat)', category: 'License phần mềm', holderId: lead.id, price: 30000000, buyDate: D(-340), renewAt: D(+25), status: 'in_use', note: 'Gia hạn hàng năm — nhớ thương lượng giá team' },
      { name: 'Gimbal DJI RS3', category: 'Thiết bị quay chụp', serial: 'DJI-RS3-889', price: 12000000, buyDate: D(-200), status: 'storage' },
    ],
  });

  /* ---------- Chấm công: 5 người × 10 ngày làm việc gần nhất ---------- */
  const attDays = workdays(10);
  const attData = [];
  [nhanvien, content, media, lead, pm].forEach((u, ui) => attDays.forEach((date, di) => {
    const s = (di + ui) % 7 === 3 ? 'remote' : (di + ui) % 11 === 5 ? 'off' : 'present';
    attData.push({ userId: u.id, date, status: s });
  }));
  await prisma.attendance.createMany({ data: attData });

  /* ---------- Nghỉ phép ---------- */
  await prisma.leave.createMany({
    data: [
      { userId: nhanvien.id, from: D(-20), to: D(-19), type: 'annual', status: 'approved', note: 'Về quê đám cưới' },
      { userId: content.id, from: D(+7), to: D(+9), type: 'annual', status: 'pending', note: 'Du lịch gia đình' },
      { userId: media.id, from: D(-10), to: D(-6), type: 'unpaid', status: 'rejected', note: 'Trùng đợt chạy chiến dịch lớn' },
    ],
  });

  /* ---------- Tuyển dụng: kanban đủ vòng ---------- */
  await prisma.candidate.createMany({
    data: [
      { name: 'Trịnh Thảo Vy', position: 'Content Writer', email: 'vy.trinh@gmail.com', phone: '0905111333', source: 'TopCV', stage: 'applied', createdAt: D(-2) },
      { name: 'Lâm Gia Huy', position: 'Designer', email: 'huy.lam@gmail.com', phone: '0912888555', source: 'Giới thiệu nội bộ', stage: 'interview1', createdAt: D(-9) },
      { name: 'Võ Thanh Tú', position: 'Media Buyer', email: 'tu.vo@gmail.com', source: 'LinkedIn', stage: 'interview2', createdAt: D(-15), note: 'Kinh nghiệm 3 năm ecommerce' },
      { name: 'Đặng Khánh Linh', position: 'Account Executive', email: 'linh.dang@gmail.com', phone: '0938444666', source: 'TopCV', stage: 'offer', createdAt: D(-22), note: 'Đã gửi offer 15tr — chờ phản hồi' },
      { name: 'Hồ Minh Nhật', position: 'Video Editor', email: 'nhat.ho@gmail.com', source: 'Facebook', stage: 'hired', createdAt: D(-40), note: 'Nhận việc đầu tháng tới' },
    ],
  });

  /* ---------- Ngân sách tháng này (60–110% để demo thanh cam/đỏ) ---------- */
  await prisma.budget.createMany({
    data: [
      { month: M(0), category: 'Lương nhân sự', amount: 190000000 },
      { month: M(0), category: 'Ngân sách quảng cáo', amount: 30000000 },
      { month: M(0), category: 'Văn phòng', amount: 25000000 },
      { month: M(0), category: 'Công cụ / phần mềm', amount: 12000000 },
      { month: M(0), category: 'Marketing nội bộ', amount: 10000000 },
    ],
  });

  /* ---------- Ticket hỗ trợ (1 vỡ SLA → insight đỏ) ---------- */
  await prisma.ticket.createMany({
    data: [
      { code: 'TK-2026-001', clientId: eva.id, title: 'Ads bị Facebook từ chối duyệt', desc: 'Chiến dịch BST bị flag chính sách — cần kháng gấp', priority: 'urgent', status: 'in_progress', assigneeId: media.id, channel: 'zalo', createdAt: DT(-30), dueAt: DT(-5) },
      { code: 'TK-2026-002', clientId: cafe.id, title: 'Muốn đổi lịch đăng bài tuần này', priority: 'high', status: 'open', assigneeId: content.id, channel: 'messenger', createdAt: DT(-10), dueAt: DT(+30) },
      { code: 'TK-2026-003', clientId: smile.id, title: 'Form đặt lịch không nhận số điện thoại bàn', priority: 'normal', status: 'waiting', assigneeId: lead.id, channel: 'email', createdAt: DT(-50), dueAt: DT(+40), desc: 'Chờ khách xác nhận format số cần hỗ trợ' },
      { code: 'TK-2026-004', clientId: eva.id, title: 'Xuất lại báo cáo ads tháng trước bản PDF', priority: 'low', status: 'resolved', assigneeId: media.id, channel: 'email', createdAt: DT(-100), dueAt: DT(-20), resolvedAt: DT(-40) },
      { code: 'TK-2026-005', clientId: minhphat.id, title: 'Hỏi quy trình bàn giao file thiết kế', priority: 'normal', status: 'closed', assigneeId: am.id, channel: 'phone', createdAt: DT(-200), dueAt: DT(-150), resolvedAt: DT(-180) },
    ],
  });

  /* ---------- OKR quý hiện tại ---------- */
  await prisma.okr.createMany({
    data: [
      { quarter: Q(), userId: null, title: 'Doanh thu quý đạt 1 tỷ', target: 1000, current: 620, unit: 'triệu đ' },
      { quarter: Q(), userId: null, title: 'Giữ chân 90% khách retainer', target: 90, current: 80, unit: '%' },
      { quarter: Q(), userId: am.id, title: 'Ký mới 6 khách hàng', target: 6, current: 3, unit: 'khách' },
      { quarter: Q(), userId: pm.id, title: 'Utilization team ≥ 65%', target: 65, current: 48, unit: '%' },
      { quarter: Q(), userId: hr.id, title: 'Tuyển đủ 3 vị trí đang mở', target: 3, current: 1, unit: 'người' },
    ],
  });

  /* ---------- NPS ---------- */
  await prisma.npsResponse.createMany({
    data: [
      { clientId: eva.id, score: 10, date: D(-5), comment: 'Team phản hồi nhanh, video đẹp hơn kỳ vọng' },
      { clientId: cafe.id, score: 9, date: D(-12), comment: 'Content đều và đúng chất quán' },
      { clientId: smile.id, score: 7, date: D(-20), comment: 'Ổn nhưng landing trễ tiến độ' },
      { clientId: minhphat.id, score: 9, date: D(-3) },
      { clientId: spa.id, score: 6, date: D(-70), comment: 'Kết quả ads chưa như kỳ vọng' },
      { clientId: spa.id, score: 3, date: D(-50), comment: 'Ngừng vì chi phí cao so với đơn về' },
    ],
  });

  /* ---------- Hoa hồng sales (module v3.2) ---------- */
  await prisma.commission.createMany({
    data: [
      { userId: am.id, invoiceId: inv1.id, clientId: eva.id, rate: 5, amount: Math.round(inv1Grand * 0.05), month: D(-22).slice(0, 7), status: 'paid', createdAt: D(-20), note: 'INV-2026-001 — EVA đợt 1' },
      { userId: am.id, invoiceId: inv2.id, clientId: cafe.id, rate: 5, amount: Math.round(retGrand * 0.05), month: M(-1), status: 'paid', createdAt: MD(-1, 9), note: 'Retainer Cà phê Nhà Mình' },
      { userId: am.id, invoiceId: inv5.id, clientId: eva.id, rate: 5, amount: Math.round(inv5Grand * 0.05), month: M(0), status: 'pending', createdAt: D(-6), note: 'INV-2026-005 — EVA đợt 2' },
    ],
  });

  /* ---------- Hoạt động CRM (1 lịch hẹn hôm nay → insight; khách Spa im ắng >45 ngày) ---------- */
  await prisma.activity.createMany({
    data: [
      { kind: 'meeting', refType: 'client', refId: eva.id, title: 'Họp duyệt key visual BST với chị Vy', date: D(-2), done: true, userId: am.id },
      { kind: 'call', refType: 'client', refId: cafe.id, title: 'Gọi anh Tuấn chốt gia hạn hợp đồng retainer', date: D(0), done: false, userId: am.id },
      { kind: 'email', refType: 'client', refId: smile.id, title: 'Gửi bản landing final chờ duyệt', date: D(-4), done: true, userId: lead.id },
      { kind: 'meeting', refType: 'lead', refId: 'lead-mb', title: 'Pitching Mây Bakery', date: D(+3), done: false, userId: am.id },
      { kind: 'note', refType: 'client', refId: spa.id, title: 'Khách tạm ngừng — hẹn tái kết nối cuối năm', date: D(-120), done: true, userId: am.id },
    ],
  });

  /* ---------- Phê duyệt đang chờ (badge đỏ menu Phê duyệt) ---------- */
  await prisma.approval.create({
    data: {
      type: 'expense', title: 'Duyệt khoản chi 18.000.000đ — Booking KOL bổ sung chiến dịch EVA',
      amount: 18000000, requesterId: pm.id, requesterName: pm.name,
      payload: J({ type: 'expense', category: 'Ngân sách quảng cáo', amount: 18000000, date: D(0), desc: 'Booking KOL bổ sung chiến dịch EVA' }),
      steps: J([{ role: 'ACCOUNTANT', label: 'Kế toán', status: 'pending' }]),
      status: 'pending',
    },
  });

  /* ---------- Nhắn tin nội bộ: kênh #Chung + 1 nhóm dự án ---------- */
  const allUsers = [giamdoc, ketoan, am, pm, hr, lead, nhanvien, quanly, content, media];
  const general = await prisma.conversation.create({ data: { type: 'general', name: 'Kênh chung' } });
  await prisma.convMember.createMany({ data: allUsers.map(u => ({ convId: general.id, userId: u.id, lastReadAt: DT(-100) })) });
  await prisma.message.createMany({
    data: [
      { convId: general.id, senderId: giamdoc.id, content: 'Chào cả nhà, từ tháng này mình chạy ERP bản v3.2 — mọi việc, giờ công, nghỉ phép đều thao tác trên đây nhé.', createdAt: DT(-72) },
      { convId: general.id, senderId: pm.id, content: 'Nhắc team EVA: video hero cần chốt trước cuối tuần, mọi người ưu tiên nhé.', createdAt: DT(-30) },
      { convId: general.id, senderId: hr.id, content: 'Thứ 6 này công ty liên hoan chào mừng thành viên mới 🎉 Mọi người điền khẩu vị vào form nhé.', createdAt: DT(-8) },
      { convId: general.id, senderId: am.id, content: 'Tin vui: Minh Phát vừa xác nhận ký hợp đồng bộ nhận diện! 🎊', createdAt: DT(-2) },
    ],
  });
  const grp = await prisma.conversation.create({ data: { type: 'group', name: 'Dự án EVA Thu Đông' } });
  await prisma.convMember.createMany({ data: [pm, lead, nhanvien, media].map(u => ({ convId: grp.id, userId: u.id, lastReadAt: DT(-100) })) });
  await prisma.message.createMany({
    data: [
      { convId: grp.id, senderId: pm.id, content: 'Khách phản hồi key visual: đổi tone ấm hơn, Hà xem giúp nhé.', createdAt: DT(-20) },
      { convId: grp.id, senderId: nhanvien.id, content: 'Ok anh, em gửi bản chỉnh trước 5h chiều nay.', createdAt: DT(-19) },
    ],
  });

  /* ---------- CSAT theo ticket đã xử lý (v3.3) ---------- */
  const tkResolved = await prisma.ticket.findFirst({ where: { code: 'TK-2026-004' } });
  const tkClosed = await prisma.ticket.findFirst({ where: { code: 'TK-2026-005' } });
  await prisma.csatResponse.createMany({
    data: [
      { ticketId: tkResolved?.id, clientId: eva.id, score: 5, date: D(-1), comment: 'Xuất lại báo cáo nhanh, cảm ơn team!' },
      { ticketId: tkClosed?.id, clientId: minhphat.id, score: 4, date: D(-7), comment: 'Hướng dẫn rõ ràng' },
    ],
  });

  /* ---------- RFQ so giá + onboarding mẫu (v3.5) ---------- */
  await prisma.rfq.create({
    data: {
      title: 'In 500 standee + backdrop chiến dịch EVA', status: 'decided',
      quotes: J([
        { vendorId: vPrint.id, price: 8000000, note: 'Giao 3 ngày, chất lượng quen' },
        { vendorId: vStudio.id, price: 9500000, note: 'Giao 1 ngày nhưng đắt hơn', chosen: false },
      ].map((q, i) => i === 0 ? { ...q, chosen: true } : q)),
      note: 'Chọn Nhà in Sao Việt — rẻ hơn 1.5tr, deadline không gấp',
    },
  });
  const hired = await prisma.candidate.findFirst({ where: { stage: 'hired' } });
  await prisma.onboarding.create({
    data: {
      name: hired?.name || 'Hồ Minh Nhật', candidateId: hired?.id || null, position: hired?.position || 'Video Editor',
      items: J([
        { text: 'Ký hợp đồng lao động + nhận hồ sơ', done: true },
        { text: 'Tạo tài khoản ERP + email công ty', done: true },
        { text: 'Chuẩn bị laptop / thiết bị làm việc', done: false },
        { text: 'Thêm vào Kênh chung + nhóm làm việc', done: false },
        { text: 'Giới thiệu team + chỉ định người hướng dẫn', done: false },
        { text: 'Hướng dẫn chấm công, nghỉ phép, quy trình nội bộ', done: false },
      ]),
    },
  });

  /* ---------- Link tài liệu mẫu (v3.5) ---------- */
  await prisma.docLink.createMany({
    data: [
      { refType: 'project', refId: p1.id, title: 'Brief BST Thu Đông (Notion)', url: 'https://notion.so/brief-bst-thu-dong', addedBy: pm.id },
      { refType: 'project', refId: p1.id, title: 'Thư mục ảnh sản phẩm (Drive)', url: 'https://drive.google.com/drive/folders/eva-bst', addedBy: nhanvien.id },
      { refType: 'client', refId: eva.id, title: 'Guideline thương hiệu EVA', url: 'https://drive.google.com/file/eva-guideline', addedBy: am.id },
    ],
  });

  /* ---------- Đợt đánh giá hiệu suất quý này (v3.8) ---------- */
  const CRIT = ['Chất lượng công việc', 'Tiến độ & deadline', 'Chủ động & sáng tạo', 'Phối hợp nhóm', 'Kỷ luật & thái độ'];
  await prisma.review.createMany({
    data: [
      { userId: nhanvien.id, quarter: Q(), status: 'final', selfNote: 'Em muốn học thêm motion graphics', mgrNote: 'Thiết kế ổn định, cần chủ động deadline hơn', scores: J(CRIT.map((name, i) => ({ name, self: [4, 3, 4, 5, 4][i], mgr: [4, 3, 4, 5, 5][i] }))) },
      { userId: content.id, quarter: Q(), status: 'self_done', selfNote: 'Quý này em viết đều 20 bài/tháng', scores: J(CRIT.map((name, i) => ({ name, self: [4, 4, 3, 4, 5][i], mgr: 0 }))) },
      { userId: media.id, quarter: Q(), status: 'pending', scores: '[]' },
    ],
  });

  /* ---------- Mẫu dự án (v3.10) ---------- */
  await prisma.projectTemplate.createMany({
    data: [
      {
        name: 'Bộ nhận diện thương hiệu', service: 'Branding', budgetHours: 120,
        phases: J([
          { name: 'Nghiên cứu & Định hướng', tasks: [
            { title: 'Brief & nghiên cứu thị trường', estHours: 8, priority: 'high', offsetDays: 3 },
            { title: 'Moodboard & định hướng thị giác', estHours: 12, priority: 'high', offsetDays: 7 },
          ] },
          { name: 'Thiết kế', tasks: [
            { title: 'Phác thảo 3 hướng logo', estHours: 20, priority: 'high', offsetDays: 14 },
            { title: 'Hoàn thiện logo chọn', estHours: 16, priority: 'medium', offsetDays: 20 },
            { title: 'Bộ nhận diện cơ bản (namecard, letterhead…)', estHours: 24, priority: 'medium', offsetDays: 28 },
          ] },
          { name: 'Bàn giao', tasks: [
            { title: 'Brand guideline PDF', estHours: 16, priority: 'medium', offsetDays: 34 },
            { title: 'Đóng gói & bàn giao file gốc', estHours: 8, priority: 'low', offsetDays: 38 },
          ] },
        ]),
        milestones: J([{ name: 'Chốt hướng logo', offsetDays: 14 }, { name: 'Nghiệm thu & bàn giao', offsetDays: 38 }]),
      },
      {
        name: 'Chiến dịch Social + Ads', service: 'Social Media', budgetHours: 90,
        phases: J([
          { name: 'Lên kế hoạch', tasks: [
            { title: 'Chiến lược nội dung + lịch đăng', estHours: 12, priority: 'high', offsetDays: 5 },
            { title: 'Kế hoạch ads & ngân sách', estHours: 8, priority: 'high', offsetDays: 5 },
          ] },
          { name: 'Sản xuất', tasks: [
            { title: 'Thiết kế bộ ấn phẩm tháng', estHours: 30, priority: 'medium', offsetDays: 15 },
            { title: 'Viết nội dung 20 bài', estHours: 20, priority: 'medium', offsetDays: 15 },
          ] },
          { name: 'Vận hành', tasks: [
            { title: 'Setup & chạy ads', estHours: 12, priority: 'high', offsetDays: 18 },
            { title: 'Báo cáo hiệu quả cuối kỳ', estHours: 8, priority: 'medium', offsetDays: 30 },
          ] },
        ]),
        milestones: J([{ name: 'Golive chiến dịch', offsetDays: 16 }, { name: 'Báo cáo tổng kết', offsetDays: 30 }]),
      },
    ],
  });

  /* ---------- Rule tự động mẫu (v3.3) ---------- */
  await prisma.rule.createMany({
    data: [
      {
        name: 'Báo tin khi thắng deal', resource: 'leads', event: 'update',
        conditions: J([{ field: 'stage', op: '=', value: 'won' }]),
        actions: J([
          { type: 'chat', template: '🎉 Deal {name} ({value}đ) vừa THẮNG! Cả nhà chúc mừng AM nhé.' },
          { type: 'task', title: 'Soạn hợp đồng cho {company}', assigneeId: am.id, dueDays: 3 },
        ]),
      },
      {
        name: 'Cảnh báo ticket khẩn', resource: 'tickets', event: 'create',
        conditions: J([{ field: 'priority', op: '=', value: 'urgent' }]),
        actions: J([{ type: 'chat', template: '🚨 Ticket KHẨN mới: {title} ({code}) — ưu tiên xử lý ngay!' }]),
      },
    ],
  });

  /* ---------- Tổng kết ---------- */
  console.log('✔ Seed v3.2 hoàn tất. Tài khoản đăng nhập (http://localhost:3300):');
  console.log('  Giám đốc   : giamdoc@agency.vn / admin123');
  console.log('  Kế toán    : ketoan@agency.vn / ketoan123');
  console.log('  Account/AM : am@agency.vn / am123456');
  console.log('  Quản lý DA : pm@agency.vn / pm123456');
  console.log('  HR         : hr@agency.vn / hr123456');
  console.log('  Trưởng nhóm: truongnhom@agency.vn / lead1234');
  console.log('  Nhân viên  : nhanvien@agency.vn / nhanvien123');
  console.log('  Đa vai trò : quanly@agency.vn / quanly123 (PM+AM+Kế toán)');
  console.log('  Phụ        : content@agency.vn, media@agency.vn / demo1234');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
