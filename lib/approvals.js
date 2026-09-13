// ============================================================
// Máy phê duyệt đa bước v2.1
// - createApproval: tạo chuỗi duyệt, tự duyệt bước trùng vai trò người yêu cầu
// - decide: duyệt/từ chối bước hiện tại; xong hết bước → thực thi side-effect
// - interceptWrite: móc vào API generic để chặn báo giá lớn / khoản chi lớn / nghỉ phép
// ============================================================
import { prisma } from './prisma.js';
import { rolesOf, isDirector, hasAny } from './perm.js';
import { emitEvent, notify, usersWithRole } from './events.js';
import { RealmOperationError } from './realm-operation.js';
// v3.13: dùng chung money/parseItems của lib/format — trước đây file này tự định dạng
// tiền kiểu "1.234.567đ" trong khi toàn app dùng "1.234.567 ₫".
import { money as fmtMoney, parseItems } from './format.js';
import { releaseRealmRedemptionHold, settleRealmRedemptionApproval } from './realm-treasury-admin.js';
import { notificationRecordRoute } from './notification-inbox.js';
import { settleVendorPayment, settleVendorPaymentInTransaction } from './financial-payment-command.js';
import { enqueueEvent } from './event-outbox.js';
import { amountInVnd } from './money.js';

// Bước đang chờ đầu tiên của một approval
export const currentStep = ap => {
  const steps = parseItems(ap.steps); // v3.13: parse an toàn — 1 bản ghi hỏng từng làm sập cả hộp duyệt
  return steps.find(s => s.status === 'pending') || null;
};
// User có quyền quyết định bước này không? (GĐ duyệt được mọi bước)
export const canDecide = (step, user) => {
  if (!step) return false;
  if (isDirector(user)) return true;
  if (step.userId) return step.userId === user.id;
  return rolesOf(user).includes(step.role);
};

export async function getSettings(db = prisma) {
  const row = await db.setting.findUnique({ where: { id: 1 } });
  const s = row ? JSON.parse(row.json) : {};
  return { approveQuoteOver: 50000000, approveExpenseOver: 10000000, approveExpenseDirectorOver: 50000000, ...s };
}

async function audit(user, action, entity, refId, detail, db = prisma) {
  await db.auditLog.create({ data: { userId: user.id, userName: user.name, action, entity, refId: refId || null, detail: detail || null } });
}

/* ---------------- Tạo chuỗi duyệt ---------------- */
export async function createApproval({ type, refId, title, amount = 0, payload, steps, user }, options = {}) {
  const db = options.db || prisma;
  const roles = rolesOf(user);
  const now = new Date().toISOString();
  // Người yêu cầu giữ vai trò của bước nào thì bước đó tự duyệt (GĐ tự duyệt mọi bước)
  steps = steps.map(st => (roles.includes(st.role) || st.userId === user.id || roles.includes('DIRECTOR'))
    ? { ...st, status: 'approved', byId: user.id, byName: user.name, at: now, note: 'Tự duyệt (người yêu cầu đảm nhiệm)' }
    : { ...st, status: 'pending' });
  const allDone = steps.every(s => s.status === 'approved');
  const data = {
      type, refId: refId || null, title, amount, payload: payload ? JSON.stringify(payload) : null,
      requesterId: user.id, requesterName: user.name, steps: JSON.stringify(steps),
      status: allDone ? 'approved' : 'pending', decidedAt: allDone ? new Date() : null,
  };
  const ap = await db.approval.create({ data });
  await audit(user, 'request', 'approvals', ap.id, title, db);
  if (options.db) await enqueueEvent(db, { resource: 'approvals', event: 'create', row: ap, user });
  if (ap.status === 'approved') await executeApproval(ap, user, options);
  else { // v3.5: báo chuông cho người giữ bước duyệt đầu tiên còn chờ
    const st = steps.find(s => s.status === 'pending');
    if (st) {
      const targets = st.userId ? [st.userId] : (await usersWithRole(st.role, options)).map(u => u.id);
      await notify(targets.filter(id => id !== user.id), `Chờ bạn duyệt: ${title}`, notificationRecordRoute('approvals', ap.id), options);
    }
  }
  return { approval: ap, autoApproved: ap.status === 'approved' };
}

/* ---------------- Thực thi khi duyệt xong ---------------- */
export async function executeApproval(ap, actor, options = {}) {
  const db = options.db || prisma;
  const user = actor || { id: ap.requesterId, name: ap.requesterName || 'hệ thống' };
  const payload = ap.payload ? JSON.parse(ap.payload) : {};
  if (ap.type === 'quote' && ap.refId) {
    const before = await db.quote.findUnique({ where: { id: ap.refId } });
    const row = await db.quote.update({ where: { id: ap.refId }, data: { status: 'sent' } });
    if (options.db) await enqueueEvent(db, { resource: 'quotes', event: 'update', row, old: before, user });
  }
  if (ap.type === 'expense') {
    const row = await db.transaction.create({ data: { ...payload, createdById: ap.requesterId } });
    if (options.db) await enqueueEvent(db, { resource: 'transactions', event: 'create', row, user });
  }
  if (ap.type === 'leave' && ap.refId) {
    const before = await db.leave.findUnique({ where: { id: ap.refId } });
    const row = await db.leave.update({ where: { id: ap.refId }, data: { status: 'approved' } });
    if (options.db) await enqueueEvent(db, { resource: 'leaves', event: 'update', row, old: before, user });
  }
  if (ap.type === 'vendorbill' && ap.refId) {
    const paymentActor = actor || await db.user.findUnique({ where: { id: ap.requesterId } });
    const command = { recordId: ap.refId, date: payload.date, idempotencyKey: `approval_${ap.id}`, approvalId: ap.id };
    if (options.db) await settleVendorPaymentInTransaction(db, paymentActor, command);
    else await settleVendorPayment(db, paymentActor, command);
  }
  if (ap.type === 'realm_redemption') {
    await settleRealmRedemptionApproval(prisma, ap, actor || { id: ap.requesterId, name: ap.requesterName });
  }
  if (ap.type === 'task_handoff') {
    const taskChange = options.db ? await executeTaskHandoff(db, ap, actor) : await db.$transaction((tx) => executeTaskHandoff(tx, ap, actor));
    if (options.db) await enqueueEvent(db, { resource: 'tasks', event: 'update', row: taskChange.updatedTask, old: taskChange.before, user });
    else await emitEvent('tasks', 'update', taskChange.updatedTask, taskChange.before, user);
    return;
  }
  await audit(user, 'approve-executed', 'approvals', ap.id, ap.title, db);
}

export async function executeTaskHandoff(db, ap, actor) {
  const payload = ap.payload ? JSON.parse(ap.payload) : {};
  const taskId = String(payload.taskId || ap.refId || '');
  const expectedAssigneeId = String(payload.expectedAssigneeId || '');
  const targetAssigneeId = String(payload.targetAssigneeId || '');
  const before = await db.task.findUnique({
    where: { id: taskId },
    include: { assignee: { select: { teamId: true } } },
  });
  if (!before || before.assigneeId !== expectedAssigneeId || before.status === 'done') {
    throw new RealmOperationError('Task đã đổi người phụ trách hoặc đã hoàn tất. Hãy tạo yêu cầu bàn giao mới.', 409, 'task_handoff_stale');
  }
  const target = await db.user.findUnique({
    where: { id: targetAssigneeId },
    select: { id: true, teamId: true, status: true, userType: true },
  });
  if (!target || target.status !== 'active' || target.userType !== 'employee') {
    throw new RealmOperationError('Người nhận bàn giao không còn khả dụng.', 409, 'task_handoff_target_unavailable');
  }
  if (before.assignee?.teamId && target.teamId !== before.assignee.teamId) {
    throw new RealmOperationError('Người nhận không còn thuộc cùng Guild. Hãy tạo yêu cầu bàn giao mới.', 409, 'task_handoff_target_outside_team');
  }
  const changed = await db.task.updateMany({
    where: { id: taskId, assigneeId: expectedAssigneeId, status: { not: 'done' } },
    data: { assigneeId: targetAssigneeId },
  });
  if (changed.count !== 1) {
    throw new RealmOperationError('Task vừa được cập nhật ở nơi khác. Hãy tải lại.', 409, 'task_handoff_stale');
  }
  const updatedTask = await db.task.findUnique({ where: { id: taskId } });
  await db.auditLog.create({ data: {
    userId: actor?.id || ap.requesterId,
    userName: actor?.name || ap.requesterName || 'hệ thống',
    action: 'approve-executed',
    entity: 'approvals',
    refId: ap.id,
    detail: ap.title,
  } });
  return { before, updatedTask };
}

export async function rejectSideEffect(ap, actor) {
  if (ap.type === 'leave' && ap.refId) {
    await prisma.leave.update({ where: { id: ap.refId }, data: { status: 'rejected' } }).catch(() => {});
  }
  if (ap.type === 'realm_redemption') {
    await releaseRealmRedemptionHold(prisma, ap, actor || { id: ap.requesterId, name: ap.requesterName });
  }
  // quote → giữ nháp; expense/vendorbill → không thực thi gì
}

/* ---------------- Thanh toán NCC (dùng chung) ---------------- */
export async function payVendorBill(billId, date, user, options = {}) {
  const result = await settleVendorPayment(prisma, user, { recordId: billId, date, ...options });
  return { ...result.record, _payment: { ...result.receipt, replayed: result.replayed } };
}

/* ---------------- Chặn ghi theo ngưỡng (móc vào API generic) ---------------- */
const grandOf = data => {
  let items = [];
  try { items = JSON.parse(data.items || '[]'); } catch {}
  const sub = items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
  return Math.round(sub * (1 + (+data.vat || 0) / 100));
};

// Supplying db binds settings, approval effects, audit and notifications to the
// caller's transaction; legacy callers may continue omitting this option.
export async function interceptWrite(resource, existing, data, user, options = {}) {
  const db = options.db || prisma;
  const s = await getSettings(db);

  // 1. Báo giá lớn: không cho tự chuyển sang "Đã gửi" — cần GĐ duyệt
  if (resource === 'quotes' && data.status === 'sent' && !isDirector(user)) {
    const grand = grandOf({ ...existing, ...data });
    if (grand >= s.approveQuoteOver) {
      const refId = existing?.id || null;
      const dup = refId ? await db.approval.findFirst({ where: { type: 'quote', refId, status: 'pending' } }) : null;
      const approvedBefore = refId ? await db.approval.findFirst({ where: { type: 'quote', refId, status: 'approved' } }) : null;
      if (approvedBefore) return null; // đã duyệt rồi → cho gửi
      const newData = { ...data, status: 'draft' };
      return {
        data: newData,
        after: async row => {
          if (!dup) await createApproval({
            type: 'quote', refId: row.id, title: `Duyệt gửi báo giá ${row.code} (${fmtMoney(grand)})`,
            amount: grand, steps: [{ role: 'DIRECTOR', label: 'Giám đốc' }], user,
          }, options);
          return `Báo giá ${fmtMoney(grand)} ≥ ngưỡng ${fmtMoney(s.approveQuoteOver)} — đã gửi Giám đốc duyệt, tạm giữ ở trạng thái Nháp`;
        },
      };
    }
  }

  // 2. Khoản chi lớn: không ghi sổ ngay — tạo yêu cầu duyệt
  if (resource === 'transactions' && !existing && data.type === 'expense' && !isDirector(user)) {
    const approvalAmount = amountInVnd(data.amount, data.currency, data.fxRate);
    if (approvalAmount >= s.approveExpenseOver) {
      const steps = [{ role: 'ACCOUNTANT', label: 'Kế toán' }];
      if (approvalAmount >= s.approveExpenseDirectorOver) steps.push({ role: 'DIRECTOR', label: 'Giám đốc' });
      const { autoApproved } = await createApproval({
        type: 'expense', title: `Duyệt khoản chi ${fmtMoney(approvalAmount)} — ${data.desc || data.category || ''}`,
        amount: approvalAmount, payload: data, steps, user,
      }, options);
      return {
        block: autoApproved
          ? 'Khoản chi đã được tự duyệt (bạn giữ vai trò duyệt) và ghi vào sổ quỹ'
          : `Khoản chi ≥ ${fmtMoney(s.approveExpenseOver)} — đã tạo yêu cầu phê duyệt, sẽ ghi sổ sau khi duyệt xong`,
      };
    }
  }

  // 3. Nghỉ phép: tạo chuỗi duyệt Trưởng nhóm → HR (>3 ngày)
  if (resource === 'leaves' && !existing) {
    return {
      data,
      after: async row => {
        const requester = await db.user.findUnique({ where: { id: row.userId } });
        const days = Math.round((new Date(row.to) - new Date(row.from)) / 86400000) + 1;
        const steps = [];
        if (requester?.teamId) {
          const team = await db.team.findUnique({ where: { id: requester.teamId } });
          if (team?.leadId && team.leadId !== row.userId) {
            const lead = await db.user.findUnique({ where: { id: team.leadId } });
            if (lead) steps.push({ role: 'LEAD', userId: lead.id, label: 'Trưởng nhóm ' + lead.name });
          }
        }
        if (days > 3 || !steps.length) steps.push({ role: 'HR', label: 'HR' });
        const { autoApproved } = await createApproval({
          type: 'leave', refId: row.id,
          title: `Nghỉ phép ${days} ngày — ${requester?.name || ''} (${row.from} → ${row.to})`,
          steps, user,
        }, options);
        return autoApproved ? 'Đơn nghỉ phép được tự duyệt' : 'Đơn đã gửi — chờ ' + steps.filter(x => x.status !== 'approved').map(x => x.label).join(' rồi ');
      },
    };
  }
  return null;
}
