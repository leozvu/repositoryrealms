// v3.10: Chỉ số vận hành mọi dự án — tính server-side, biên lợi nhuận chỉ trả cho
// CEO / Kế toán / PM / Lead (nhân viên thường thấy tiến độ + sức khỏe, không thấy tiền).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
import { projectStats } from '@/lib/projectStats';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const canSeeMoney = hasAny(user, ['ACCOUNTANT', 'PM', 'LEAD']); // + DIRECTOR ngầm định trong hasAny

  const [projects, tasks, timeLogs, users, bills] = await Promise.all([
    prisma.project.findMany(),
    prisma.task.findMany(),
    prisma.timeLog.findMany(),
    prisma.user.findMany({ select: { id: true, salary: true } }),
    canSeeMoney ? prisma.vendorBill.findMany({ select: { projectId: true, amount: true } }) : [],
  ]);
  const usersById = Object.fromEntries(users.map(u => [u.id, u]));
  const stats = {};
  for (const p of projects) stats[p.id] = projectStats({ project: p, tasks, timeLogs, usersById, vendorBills: bills, canSeeMoney });
  return NextResponse.json({ canSeeMoney, stats });
}
