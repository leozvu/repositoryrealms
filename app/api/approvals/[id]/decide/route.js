import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { executeApproval, rejectSideEffect, currentStep, canDecide } from '@/lib/approvals';

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { decision, note } = await req.json(); // approve | reject
  const ap = await prisma.approval.findUnique({ where: { id: params.id } });
  if (!ap || ap.status !== 'pending') return NextResponse.json({ error: 'Yêu cầu không tồn tại hoặc đã xử lý' }, { status: 400 });
  const steps = JSON.parse(ap.steps || '[]');
  const idx = steps.findIndex(s => s.status === 'pending');
  const step = steps[idx];
  if (!canDecide(step, user)) return NextResponse.json({ error: 'Bạn không có quyền duyệt bước này' }, { status: 403 });

  steps[idx] = { ...step, status: decision === 'approve' ? 'approved' : 'rejected', byId: user.id, byName: user.name, at: new Date().toISOString(), note: note || null };
  let status = 'pending';
  if (decision !== 'approve') status = 'rejected';
  else if (steps.every(s => s.status === 'approved')) status = 'approved';

  const updated = await prisma.approval.update({
    where: { id: ap.id },
    data: { steps: JSON.stringify(steps), status, decidedAt: status !== 'pending' ? new Date() : null },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action: decision === 'approve' ? 'approve' : 'reject', entity: 'approvals', refId: ap.id, detail: ap.title },
  });
  if (status === 'approved') await executeApproval(updated, user);
  if (status === 'rejected') await rejectSideEffect(updated);
  return NextResponse.json(updated);
}
