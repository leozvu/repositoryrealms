// v3.12: Trả tiền freelancer — đánh dấu đã trả + tự ghi vào sổ quỹ (như thanh toán NCC).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user) || !hasAny(user, ['ACCOUNTANT', 'PM', 'LEAD', 'HR'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const payout = await prisma.payout.findUnique({ where: { id: params.id } });
  if (!payout || payout.status === 'paid') return NextResponse.json({ error: 'Không hợp lệ hoặc đã trả' }, { status: 400 });
  const fl = await prisma.user.findUnique({ where: { id: payout.userId } });
  const { date } = await req.json().catch(() => ({}));
  const payDate = date || new Date().toISOString().slice(0, 10);
  await prisma.$transaction([
    prisma.payout.update({ where: { id: params.id }, data: { status: 'paid', paidDate: payDate } }),
    prisma.transaction.create({
      data: { type: 'expense', category: 'Thanh toán freelancer', amount: payout.amount, date: payDate,
        desc: `Trả freelancer ${fl?.name || ''}${payout.note ? ' — ' + payout.note : ''}`, projectId: payout.projectId, createdById: user.id },
    }),
    prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'payment', entity: 'payouts', refId: params.id, detail: `Trả freelancer ${fl?.name || ''}: ${payout.amount.toLocaleString('vi-VN')}đ` } }),
  ]);
  return NextResponse.json({ ok: true });
}
