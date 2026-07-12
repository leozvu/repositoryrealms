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
};

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  return NextResponse.json({ ...DEFAULTS, ...(row ? JSON.parse(row.json) : {}) });
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
