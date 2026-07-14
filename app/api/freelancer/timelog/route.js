// v3.11: Freelancer ghi giờ vào dự án MÌNH tham gia. Giờ này vào chi phí dự án (đơn giá FL).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { freelancerGuard } from '@/lib/freelancer';

export async function GET() {
  let ctx;
  try { ctx = await freelancerGuard(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || 403 }); }
  const logs = await prisma.timeLog.findMany({ where: { userId: ctx.user.id }, orderBy: { date: 'desc' }, take: 60 });
  return NextResponse.json(logs);
}

export async function POST(req) {
  let ctx;
  try { ctx = await freelancerGuard(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || 403 }); }
  const { user, projectIds } = ctx;
  const { projectId, date, hours, note } = await req.json();
  if (!projectIds.includes(projectId)) return NextResponse.json({ error: 'Không thuộc dự án này' }, { status: 403 });
  if (!(+hours > 0)) return NextResponse.json({ error: 'Số giờ không hợp lệ' }, { status: 400 });
  const log = await prisma.timeLog.create({
    data: { userId: user.id, projectId, date: date || new Date().toISOString().slice(0, 10), hours: +hours, billable: true, note: note || 'Freelancer' },
  });
  return NextResponse.json(log);
}

export async function DELETE(req) {
  let ctx;
  try { ctx = await freelancerGuard(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || 403 }); }
  const { id } = await req.json();
  const log = await prisma.timeLog.findUnique({ where: { id } });
  if (!log || log.userId !== ctx.user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await prisma.timeLog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
