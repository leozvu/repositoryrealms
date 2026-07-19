import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { executeApproval, executeTaskHandoff, rejectSideEffect, currentStep, canDecide } from '@/lib/approvals';
import { emitEvent, notify, usersWithRole } from '@/lib/events';
import { RealmOperationError } from '@/lib/realm-operation';
import { parseItems } from '@/lib/format';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';
import { notificationRecordRoute } from '@/lib/notification-inbox';
import { decideRealmLaunchApproval } from '@/lib/realm-launch-approval';
import { realmLaunchSecret } from '@/lib/realm-launch-token';

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const { decision, note } = await req.json(); // approve | reject
  const ap = await prisma.approval.findUnique({ where: { id: params.id } });
  if (!ap || ap.status !== 'pending') return NextResponse.json({ error: 'Yêu cầu không tồn tại hoặc đã xử lý' }, { status: 400 });
  if (ap.type === 'realm_launch') {
    try {
      const result = await decideRealmLaunchApproval(prisma, user, {
        approvalId: ap.id,
        decision,
        note,
        secret: realmLaunchSecret(),
      });
      const finalStatus = result.approval.status;
      await notify(
        ap.requesterId,
        result.outcome === 'stale'
          ? `Yêu cầu "${ap.title}" đã bị đóng vì policy nguồn thay đổi hoặc hết hạn.`
          : `Yêu cầu "${ap.title}" đã được ${finalStatus === 'approved' ? 'DUYỆT' : 'TỪ CHỐI'} bởi ${user.name}`,
        notificationRecordRoute('approvals', ap.id),
      );
      await safelyPublishRealmChange(prisma, {
        resource: 'approvals', action: finalStatus, entityId: ap.id, actorId: user.id,
      });
      if (result.outcome === 'stale') {
        return NextResponse.json({
          error: 'Yêu cầu đã hết hạn hoặc policy nguồn đã thay đổi. Policy Realm không bị cập nhật.',
          code: 'realm_launch_approval_stale',
          approval: result.approval,
        }, { status: 409 });
      }
      return NextResponse.json({ ...result.approval, policy: result.policy });
    } catch (error) {
      if (error instanceof RealmOperationError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      throw error;
    }
  }
  if (['realm_redemption', 'task_handoff'].includes(ap.type) && ap.requesterId === user.id) {
    return NextResponse.json({ error: 'Người tạo yêu cầu không được tự duyệt yêu cầu của mình.', code: 'self_approval_forbidden' }, { status: 409 });
  }
  const steps = parseItems(ap.steps); // v3.13: parse an toàn
  const idx = steps.findIndex(s => s.status === 'pending');
  const step = steps[idx];
  if (!canDecide(step, user)) return NextResponse.json({ error: 'Bạn không có quyền duyệt bước này' }, { status: 403 });

  steps[idx] = { ...step, status: decision === 'approve' ? 'approved' : 'rejected', byId: user.id, byName: user.name, at: new Date().toISOString(), note: note || null };
  let status = 'pending';
  if (decision !== 'approve') status = 'rejected';
  else if (steps.every(s => s.status === 'approved')) status = 'approved';

  const decisionData = { steps: JSON.stringify(steps), status, decidedAt: status !== 'pending' ? new Date() : null };
  let updated;
  let taskChange = null;
  if (ap.type === 'task_handoff') {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const claimed = await tx.approval.updateMany({
          where: { id: ap.id, status: 'pending', steps: ap.steps },
          data: decisionData,
        });
        if (claimed.count !== 1) {
          throw new RealmOperationError('Yêu cầu vừa được xử lý ở phiên khác. Hãy tải lại.', 409, 'approval_decision_stale');
        }
        const claimedApproval = await tx.approval.findUnique({ where: { id: ap.id } });
        await tx.auditLog.create({
          data: { userId: user.id, userName: user.name, action: decision === 'approve' ? 'approve' : 'reject', entity: 'approvals', refId: ap.id, detail: ap.title },
        });
        const handoff = status === 'approved' ? await executeTaskHandoff(tx, claimedApproval, user) : null;
        return { updated: claimedApproval, taskChange: handoff };
      });
      updated = result.updated;
      taskChange = result.taskChange;
    } catch (error) {
      if (error?.code === 'approval_decision_stale') {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      const failedSteps = [...steps];
      failedSteps[idx] = {
        ...failedSteps[idx],
        status: 'rejected',
        note: `Không thể thực thi: ${String(error?.message || error).slice(0, 180)}`,
      };
      let closed = false;
      await prisma.$transaction(async (tx) => {
        const result = await tx.approval.updateMany({
          where: { id: ap.id, status: 'pending', steps: ap.steps },
          data: { steps: JSON.stringify(failedSteps), status: 'rejected', decidedAt: new Date() },
        });
        closed = result.count === 1;
        if (closed) await tx.auditLog.create({
          data: { userId: user.id, userName: user.name, action: 'approve_failed', entity: 'approvals', refId: ap.id, detail: String(error?.message || error).slice(0, 240) },
        });
      });
      if (closed) {
        await notify(ap.requesterId, `Bàn giao “${ap.title}” không thể thực thi. Hãy kiểm tra và tạo yêu cầu mới.`, notificationRecordRoute('approvals', ap.id));
        await safelyPublishRealmChange(prisma, { resource: 'approvals', action: 'rejected', entityId: ap.id, actorId: user.id });
      }
      return NextResponse.json({ error: error?.message || 'Không thể thực hiện bàn giao Task.', code: error?.code || 'task_handoff_failed' }, { status: error?.status || 409 });
    }
    if (taskChange) await emitEvent('tasks', 'update', taskChange.updatedTask, taskChange.before, user);
  } else {
    updated = await prisma.approval.update({ where: { id: ap.id }, data: decisionData });
    await prisma.auditLog.create({
      data: { userId: user.id, userName: user.name, action: decision === 'approve' ? 'approve' : 'reject', entity: 'approvals', refId: ap.id, detail: ap.title },
    });
    if (status === 'approved') await executeApproval(updated, user);
  }
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
  if (['realm_redemption', 'task_handoff'].includes(ap.type)) {
    await safelyPublishRealmChange(prisma, {
      resource: ap.type === 'realm_redemption' ? 'realm_treasury' : 'approvals',
      action: status,
      entityId: ap.id,
      actorId: user.id,
    });
  }
  return NextResponse.json(updated);
}
