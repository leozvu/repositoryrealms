import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
import { computeLine } from '@/lib/payroll';

const canManage = user => hasAny(user, ['HR', 'ACCOUNTANT']);

// GET: HR/Kế toán/GĐ thấy toàn bộ; nhân viên chỉ nhận phiếu lương của mình
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rows = await prisma.payroll.findMany({ orderBy: { month: 'desc' } });
  if (canManage(user)) return NextResponse.json({ manage: true, payrolls: rows });
  const mine = rows
    .map(p => ({ id: p.id, month: p.month, status: p.status, line: JSON.parse(p.lines).find(l => l.userId === user.id) }))
    .filter(p => p.line);
  return NextResponse.json({ manage: false, payslips: mine });
}

// POST {month}: tạo bảng lương nháp từ danh sách nhân sự đang hoạt động
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManage(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { month } = await req.json();
  if (!/^\d{4}-\d{2}$/.test(month || '')) return NextResponse.json({ error: 'Tháng không hợp lệ' }, { status: 400 });
  const exists = await prisma.payroll.findUnique({ where: { month } });
  if (exists) return NextResponse.json({ error: `Bảng lương tháng ${month.slice(5)}/${month.slice(0, 4)} đã tồn tại` }, { status: 400 });
  const staff = await prisma.user.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } });
  const lines = staff.map(s => computeLine({ userId: s.id, name: s.name, base: s.salary || 0, allowance: 0, bonus: 0 }));
  const row = await prisma.payroll.create({ data: { month, lines: JSON.stringify(lines) } });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'create', entity: 'payroll', refId: row.id, detail: 'Bảng lương ' + month } });
  return NextResponse.json(row);
}

// PUT {id, lines}: sửa phụ cấp/thưởng khi còn nháp — server tính lại toàn bộ
export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManage(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id, lines } = await req.json();
  const p = await prisma.payroll.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (p.status === 'final') return NextResponse.json({ error: 'Bảng lương đã chốt — không sửa được' }, { status: 400 });
  const computed = (lines || []).map(computeLine);
  const row = await prisma.payroll.update({ where: { id }, data: { lines: JSON.stringify(computed) } });
  return NextResponse.json(row);
}
