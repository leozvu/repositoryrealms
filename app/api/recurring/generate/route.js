import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';
import { dueTemplates, genDate, recurTag } from '@/lib/recurring';

// v3.32: Sinh phiếu chi định kỳ cho tháng hiện tại từ các mẫu đang bật (chưa sinh trong tháng).
export async function POST(req, ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user) || !hasAny(user, ['ACCOUNTANT'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { month } = await req.json().catch(() => ({}));
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7);
  const [templates, txs] = await Promise.all([
    prisma.recurringExpense.findMany(),
    prisma.transaction.findMany({ where: { type: 'expense', date: { startsWith: m } } }),
  ]);
  const due = dueTemplates(templates, txs, m);
  if (!due.length) return NextResponse.json({ created: 0, note: 'Không có mẫu nào cần sinh (đã sinh hết cho tháng này).' });

  await prisma.$transaction([
    ...due.map(t => prisma.transaction.create({
      data: {
        type: 'expense', category: t.category, amount: t.amount, currency: 'VND', fxRate: 1,
        date: genDate(m, t.dayOfMonth), desc: `${t.note || t.category} (định kỳ) ${recurTag(t.id)}`, createdById: user.id,
      },
    })),
    prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'create', entity: 'recurringexpenses', detail: `Sinh ${due.length} chi phí định kỳ tháng ${m}` } }),
  ]);
  return NextResponse.json({ created: due.length });
}
