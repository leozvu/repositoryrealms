// v3.11: Trang chủ freelancer — chỉ dự án được gán + việc của mình. Không lộ gì khác.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { freelancerGuard } from '@/lib/freelancer';

export async function GET() {
  let ctx;
  try { ctx = await freelancerGuard(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || 403 }); }
  const { user, projectIds } = ctx;

  const [projects, tasks, myLogs, payouts] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, service: true, deadline: true, status: true } }),
    prisma.task.findMany({ where: { assigneeId: user.id }, orderBy: { dueDate: 'asc' } }),
    prisma.timeLog.findMany({ where: { userId: user.id } }),
    prisma.payout.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const tm = new Date().toISOString().slice(0, 7);
  const hoursThisMonth = myLogs.filter(l => l.date.startsWith(tm)).reduce((s, l) => s + l.hours, 0);

  return NextResponse.json({
    me: { name: user.name, skills: user.skills, hourlyRate: user.hourlyRate, accessUntil: user.accessUntil },
    projects,
    tasks: tasks.filter(t => projectIds.includes(t.projectId)),
    hoursThisMonth: Math.round(hoursThisMonth * 10) / 10,
    totalHours: Math.round(myLogs.reduce((s, l) => s + l.hours, 0) * 10) / 10,
    payouts: payouts.map(p => ({ id: p.id, amount: p.amount, status: p.status, note: p.note, kind: p.kind, hours: p.hours, paidDate: p.paidDate })),
    pendingPay: payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
  });
}
