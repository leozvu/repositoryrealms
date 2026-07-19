import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { executeApproval, rejectSideEffect, currentStep, canDecide } from '@/lib/approvals';
import { notify, usersWithRole } from '@/lib/events';
import { parseItems } from '@/lib/format';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';
import { notificationRecordRoute } from '@/lib/notification-inbox';

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { decision, note } = await req.json(); // approve | reject
  const ap = await prisma.approval.findUnique({ where: { id: params.id } });
  if (!ap || ap.status !== 'pending') return NextResponse.json({ error: 'Yêu cầu không tồn tại hoặc đã xử lý' }, { status: 400 });
  if (ap.type === 'realm_redemption' && ap.requesterId === user.id) {
    return NextResponse.json({ error: 'Người yêu cầu không được tự duyệt quyền lợi Gold.', code: 'self_approval_forbidden' }, { status: 409 });
  }
  const steps = parseItems(ap.steps); // v3.13: parse an toàn
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
  if (status === 'rejected') await rejectSideEffect(updated, user);
  // v3.5: báo chuông — người yêu cầu biết kết quả; còn bước tiếp thì báo người duyệt kế
  if (status !== 'pending') {
    if (ap.requesterId !== user.id)
      await notify(ap.requesterId, `Yêu cầu "${ap.title}" đã được ${status === 'approved' ? 'DUYỆT' : 'TỪ CHỐI'} bởi ${user.name}`, notificationRecordRoute('approvals', ap.id));
  } else {
    const next = steps.find(s => s.status === 'pending');
    if (next) {
      const targets = next.userId ? [next.userId] : (await usersWithRole(next.role)).map(u => u.id);
      await notify(targets.filter(id => id !== user.id), `Chờ bạn duyệt (bước tiếp): ${ap.title}`, notificationRecordRoute('approvals', ap.id));
    }
  }
  if (ap.type === 'realm_redemption') {
    await safelyPublishRealmChange(prisma, {
      resource: 'realm_treasury',
      action: status,
      entityId: ap.id,
      actorId: user.id,
    });
  }
  return NextResponse.json(updated);
}
