import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';

const itemsTotal = items => items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
const grand = inv => Math.round(itemsTotal(JSON.parse(inv.items)) * (1 + (inv.vat || 0) / 100));
const paidOf = inv => JSON.parse(inv.payments).reduce((s, p) => s + (+p.amount || 0), 0);

// Ghi nhận thanh toán: cập nhật payments + tự tạo giao dịch thu — 1 transaction nguyên tử
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasAny(user, ['ACCOUNTANT'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { amount, date, note } = await req.json();
  const inv = await prisma.invoice.findUnique({ where: { id: params.id }, include: { client: true } });
  if (!inv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const remain = grand(inv) - paidOf(inv);
  const amt = Math.min(+amount || 0, remain);
  if (amt <= 0) return NextResponse.json({ error: 'Số tiền không hợp lệ' }, { status: 400 });
  const payments = [...JSON.parse(inv.payments), { id: Date.now().toString(36), amount: amt, date, note: note || '' }];
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
