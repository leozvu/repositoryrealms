import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
// v3.13: dùng chung helper của lib/format thay vì tự parse. Bản cũ JSON.parse trần:
// một hóa đơn có items/payments hỏng là route ném 500 và hóa đơn đó KHÔNG BAO GIỜ
// ghi nhận thu được nữa. Nhưng cũng KHÔNG dùng parseItems (nuốt lỗi trả []) cho tiền:
// payments hỏng mà coi là "chưa thu gì" thì lần thu sau ghi đè mất lịch sử.
import { parseStrict, docGrand, paidOf } from '@/lib/format';

// Ghi nhận thanh toán: cập nhật payments + tự tạo giao dịch thu — 1 transaction nguyên tử
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!hasAny(user, ['ACCOUNTANT'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { amount, date, note } = await req.json();
  const inv = await prisma.invoice.findUnique({ where: { id: params.id }, include: { client: true } });
  if (!inv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // v3.13: dữ liệu hỏng thì dừng lại và nói rõ, đừng đoán
  const prevPays = parseStrict(inv.payments);
  if (!parseStrict(inv.items) || !prevPays) {
    return NextResponse.json({
      error: `Hóa đơn ${inv.code} có dữ liệu hỏng (dòng hàng / lịch sử thanh toán không đọc được). Chưa ghi nhận thu để tránh mất lịch sử — nhờ kỹ thuật kiểm tra lại bản ghi này.`,
    }, { status: 400 });
  }
  const remain = docGrand(inv) - paidOf(inv);
  const amt = Math.min(+amount || 0, remain);
  if (amt <= 0) return NextResponse.json({ error: 'Số tiền không hợp lệ' }, { status: 400 });
  const payments = [...prevPays, { id: Date.now().toString(36), amount: amt, date, note: note || '' }];
  const fullyPaid = remain - amt <= 0;
  const [updated] = await prisma.$transaction([
    prisma.invoice.update({
      where: { id: inv.id },
      data: { payments: JSON.stringify(payments), status: fullyPaid ? 'paid' : (inv.status === 'draft' ? 'sent' : inv.status), paidDate: fullyPaid ? date : null },
    }),
    prisma.transaction.create({
      data: { type: 'income', category: 'Doanh thu dịch vụ', amount: amt, date, desc: `Thu hóa đơn ${inv.code} — ${inv.client.name}${note ? ' (' + note + ')' : ''}`, projectId: inv.projectId, createdById: user.id },
    }),
    prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'payment', entity: 'invoices', refId: inv.id, detail: `${inv.code}: +${amt.toLocaleString('vi-VN')}đ` } }),
  ]);
  return NextResponse.json(updated);
}
