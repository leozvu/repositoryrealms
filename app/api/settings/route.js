import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { isDirector } from '@/lib/perm';

const DEFAULTS = {
  company: 'Agency của bạn', address: '', taxCode: '', email: '', phone: '', bank: '',
  invoicePrefix: 'INV', quotePrefix: 'BG', vat: 8, monthlyTarget: 300000000,
  approveQuoteOver: 50000000, approveExpenseOver: 10000000, approveExpenseDirectorOver: 50000000,
  // v3.4: xác suất chốt theo giai đoạn pipeline (%) — cho forecast doanh thu
  probNew: 10, probContacted: 20, probProposal: 40, probNegotiation: 60,
  autoAssignLeads: false, // v3.4: tự chia lead chưa gán cho AM ít lead mở nhất
  roleLabels: {}, // v3.6: đổi tên chức danh theo công ty (quyền giữ nguyên theo nhóm)
  leaveQuota: 12, // v3.7: số ngày phép năm mỗi nhân sự
  // v3.9: SMTP gửi email báo giá/hóa đơn (mỗi công ty một hộp thư riêng)
  smtpHost: '', smtpPort: 465, smtpUser: '', smtpPass: '', smtpFrom: '',
};

// Các trường bí mật — chỉ Giám đốc đọc được (trang Cài đặt); route server đọc thẳng DB
const SECRET_KEYS = ['anthropicKey', 'smtpPass', 'smtpUser', 'smtpHost', 'smtpPort', 'smtpFrom'];

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  const data = { ...DEFAULTS, ...(row ? JSON.parse(row.json) : {}) };
  if (!isDirector(user)) SECRET_KEYS.forEach(k => delete data[k]);
  return NextResponse.json(data);
}

export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isDirector(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const data = await req.json();
  const json = JSON.stringify({ ...DEFAULTS, ...data });
  await prisma.setting.upsert({ where: { id: 1 }, create: { id: 1, json }, update: { json } });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'update', entity: 'settings', detail: 'Cập nhật cài đặt công ty' } });
  return NextResponse.json({ ok: true });
}
