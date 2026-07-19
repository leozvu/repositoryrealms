// v3.11: Freelancer cập nhật việc CỦA MÌNH (trạng thái + checklist) — không gì khác.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { freelancerGuard } from '@/lib/freelancer';
import { emitEvent } from '@/lib/events';

export async function PUT(req, { params }) {
  let ctx;
  try { ctx = await freelancerGuard(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || 403 }); }
  const { user, projectIds } = ctx;
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task || task.assigneeId !== user.id || !projectIds.includes(task.projectId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json();
  // Chỉ cho sửa 2 trường an toàn
  const data = {};
  if (['todo', 'doing', 'review', 'done'].includes(body.status)) data.status = body.status;
  if (typeof body.checklist === 'string') data.checklist = body.checklist;
  if (!Object.keys(data).length) return NextResponse.json({ error: 'no-op' }, { status: 400 });

  // Chặn hoàn thành khi còn việc phụ thuộc chưa xong (giữ đúng luật hệ thống)
  if (data.status === 'done') {
    let deps = []; try { deps = JSON.parse(task.dependsOn || '[]'); } catch {}
    if (deps.length) {
      const blocking = await prisma.task.findMany({ where: { id: { in: deps }, status: { not: 'done' } } });
      if (blocking.length) return NextResponse.json({ error: `Chưa thể hoàn thành — còn chờ: ${blocking.map(t => t.title).join(', ')}` }, { status: 400 });
    }
  }
  const updated = await prisma.task.update({ where: { id: params.id }, data });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name + ' (FL)', action: 'update', entity: 'tasks', refId: params.id, detail: updated.title } }).catch(() => {});
  await emitEvent('tasks', 'update', updated, task, { id: user.id, name: user.name });
  return NextResponse.json({ ok: true });
}
