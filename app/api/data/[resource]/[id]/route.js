import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { RESOURCES, canWrite, canDelete } from '@/lib/registry';
import { isDirector, isFreelancer } from '@/lib/perm';
import { interceptWrite } from '@/lib/approvals';
import { emitEvent } from '@/lib/events';
import { resourceEnabled } from '@/lib/module-guard';

async function audit(user, action, entity, refId, detail) {
  await prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action, entity, refId: refId || null, detail: detail || null },
  });
}

export async function PUT(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canWrite(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await resourceEnabled(params.resource))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty' }, { status: 403 });
  const row = await prisma[cfg.model].findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (cfg.canWriteRow && !cfg.canWriteRow(row, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let data = await req.json();
  delete data.id;
  if (cfg.filterUpdate) data = cfg.filterUpdate(data, user);
  if (cfg.validate) {
    const err = await cfg.validate(row, data, prisma);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  try {
    const icp = await interceptWrite(params.resource, row, data, user);
    if (icp?.block) return NextResponse.json({ _blocked: true, _notice: icp.block });
    if (icp?.data) data = icp.data;
    // Mọi chỉnh sửa Task từ ERP cổ điển cũng làm snapshot Team Work cũ hết hạn.
    // Client không được tự gửi workVersion; registry đã strip field nội bộ này.
    if (params.resource === 'tasks') {
      data.workVersion = { increment: 1 };
      if (Object.hasOwn(data, 'status')) {
        if (data.status !== 'blocked') { data.blockReason = null; data.blockedAt = null; }
        if (data.status !== 'waiting') data.waitingReason = null;
        data.completedAt = data.status === 'done' ? new Date() : null;
      }
    }
    const updated = await prisma[cfg.model].update({ where: { id: params.id }, data });
    await audit(user, 'update', params.resource, params.id, updated.name || updated.title || updated.code || null);
    await emitEvent(params.resource, 'update', updated, row, user); // v3.3 + Realm change feed
    const notice = icp?.after ? await icp.after(updated) : null;
    const out = cfg.sanitize ? cfg.sanitize(updated, user) : updated;
    return NextResponse.json(notice ? { ...out, _notice: notice } : out);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canDelete(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await resourceEnabled(params.resource))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty' }, { status: 403 });
  const row = await prisma[cfg.model].findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // v3.7: xóa cũng phải qua kiểm tra hàng (VD bình luận chỉ chủ nhân xóa; GĐ luôn được)
  if (cfg.canWriteRow && !isDirector(user) && !cfg.canWriteRow(row, user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    await prisma[cfg.model].delete({ where: { id: params.id } });
    await audit(user, 'delete', params.resource, params.id, row.name || row.title || row.code || null);
    await emitEvent(params.resource, 'delete', row, null, user); // v3.3 + Realm change feed
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Không xóa được — còn dữ liệu liên quan (dự án, hóa đơn…)' }, { status: 400 });
  }
}
