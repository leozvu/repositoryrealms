// v3.3: API mở /api/v1/<resource>/<id> — GET / PUT / DELETE bằng Bearer API key
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiUser } from '@/lib/apiauth';
import { RESOURCES, canRead, canWrite, canDelete, canDeleteRecord } from '@/lib/registry';
import { interceptWrite } from '@/lib/approvals';
import { commitRecordMutation } from '@/lib/record-mutation';
import { resourceEnabled } from '@/lib/module-guard';


export async function GET(req, { params }) {
  params = await params;
  const user = await apiUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canRead(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await resourceEnabled(params.resource))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty' }, { status: 403 });
  const scope = cfg.scope ? await cfg.scope(user, prisma) : null;
  const row = scope
    ? await prisma[cfg.model].findFirst({ where: { AND: [{ id: params.id }, scope] } })
    : await prisma[cfg.model].findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(cfg.sanitize ? cfg.sanitize(row, user) : row);
}

export async function PUT(req, { params }) {
  params = await params;
  const user = await apiUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canWrite(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await resourceEnabled(params.resource))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty' }, { status: 403 });
  const row = await prisma[cfg.model].findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (cfg.canWriteRow && !(await cfg.canWriteRow(row, user, prisma))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let data = await req.json();
  delete data.id;
  if (cfg.filterUpdate) data = cfg.filterUpdate(data, user, row);
  if (cfg.validate) {
    const err = await cfg.validate(row, data, prisma);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  try {
    const result = await commitRecordMutation(prisma, { resource: params.resource, event: 'update', cfg, row, data, user, interceptWrite });
    if (result.blocked) return NextResponse.json({ _blocked: true, _notice: result.notice });
    const updated = result.row;
    return NextResponse.json(cfg.sanitize ? cfg.sanitize(updated, user) : updated);
  } catch (e) {
    return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status || 400 });
  }
}

export async function DELETE(req, { params }) {
  params = await params;
  const user = await apiUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canDelete(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await resourceEnabled(params.resource))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty' }, { status: 403 });
  const row = await prisma[cfg.model].findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await canDeleteRecord(params.resource, row, user, prisma))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    await commitRecordMutation(prisma, { resource: params.resource, event: 'delete', cfg, row, user });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.status === 409 ? e.message : 'Không xóa được — còn dữ liệu liên quan', ...(e.status === 409 ? { code: e.code } : {}) }, { status: e.status || 400 });
  }
}
