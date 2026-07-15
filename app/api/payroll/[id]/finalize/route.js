import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
import { parseStrict } from '@/lib/format';

// Chốt bảng lương: khóa sửa + ghi tổng chi phí công ty vào sổ quỹ (1 giao dịch nguyên tử)
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasAny(user, ['HR', 'ACCOUNTANT'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const p = await prisma.payroll.findUnique({ where: { id: params.id } });
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (p.status === 'final') return NextResponse.json({ error: 'Đã chốt rồi' }, { status: 400 });
  // v3.13: lines hỏng thì dừng. Trước đây JSON.parse trần → ném 500 chặn chốt lương cả tháng;
  // mà nuốt lỗi trả [] còn tệ hơn: chốt lương xong ghi phiếu chi 0đ, coi như đã trả lương.
  const lines = parseStrict(p.lines);
  if (!lines || !lines.length) {
    return NextResponse.json({
      error: `Bảng lương tháng ${p.month} không đọc được dòng lương nào — chưa chốt để tránh ghi phiếu chi sai. Thử tạo lại bảng lương tháng này.`,
    }, { status: 400 });
  }
  const totalCost = lines.reduce((s, l) => s + (l.employerCost || 0), 0);
  const [updated] = await prisma.$transaction([
    prisma.payroll.update({ where: { id: p.id }, data: { status: 'final' } }),
    prisma.transaction.create({
      data: {
        type: 'expense', category: 'Lương nhân sự', amount: totalCost,
        date: new Date().toISOString().slice(0, 10),
        desc: `Bảng lương tháng ${p.month.slice(5)}/${p.month.slice(0, 4)} — ${lines.length} nhân sự (gồm BH công ty đóng)`,
        createdById: user.id,
      },
    }),
    prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'payment', entity: 'payroll', refId: p.id, detail: `Chốt lương ${p.month}: ${totalCost.toLocaleString('vi-VN')}đ` } }),
  ]);
  return NextResponse.json(updated);
}
