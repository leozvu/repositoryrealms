// v3.10: Chỉ số vận hành mọi dự án — tính server-side, biên lợi nhuận chỉ trả cho
// CEO / Kế toán / PM / Lead (nhân viên thường thấy tiến độ + sức khỏe, không thấy tiền).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isFreelancer } from '@/lib/perm';
import { projectStats } from '@/lib/projectStats';
import { cached } from '@/lib/cache';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const canSeeMoney = hasAny(user, ['ACCOUNTANT', 'PM', 'LEAD']); // + DIRECTOR ngầm định trong hasAny

  // v3.13: cache 45s. Hàm này quét toàn bộ project + task + timeLog rồi với MỖI dự án lại
  // duyệt lại cả mảng task/timelog (P × (T+L) phép so sánh) — chạy lại nguyên vẹn mỗi lần
  // ai đó mở Dashboard hoặc Sở chỉ huy.
  // Khóa cache tách theo canSeeMoney: người không được xem tiền phải nhận đúng bản KHÔNG
  // có biên lợi nhuận, tuyệt đối không dùng chung với bản có tiền.
  const stats = await cached(`projectStats:${canSeeMoney ? 'money' : 'nomoney'}`, 45_000, async () => {
    const [projects, tasks, timeLogs, users, bills] = await Promise.all([
      prisma.project.findMany(),
      prisma.task.findMany(),
      prisma.timeLog.findMany(),
      prisma.user.findMany({ select: { id: true, salary: true, userType: true, hourlyRate: true } }),
      canSeeMoney ? prisma.vendorBill.findMany({ select: { projectId: true, amount: true } }) : [],
    ]);
    const usersById = Object.fromEntries(users.map(u => [u.id, u]));
    const out = {};
    for (const p of projects) out[p.id] = projectStats({ project: p, tasks, timeLogs, usersById, vendorBills: bills, canSeeMoney });
    return out;
  });
  return NextResponse.json({ canSeeMoney, stats });
}
