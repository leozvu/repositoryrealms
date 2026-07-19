// v3.3: API mở /api/v1/<resource> — xác thực bằng Bearer API key (Cài đặt → API & Webhook).
// Key mang vai trò như user thật nên đi qua đúng RBAC + máy phê duyệt + rule tự động.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiUser } from '@/lib/apiauth';
import { RESOURCES, canRead, canWrite } from '@/lib/registry';
import { interceptWrite } from '@/lib/approvals';
import { emitEvent } from '@/lib/events';

async function audit(user, action, entity, refId, detail) {
  await prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action, entity, refId: refId || null, detail: detail || null },
  });
}

export async function GET(req, { params }) {
  const user = await apiUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized — thiếu hoặc sai Bearer API key' }, { status: 401 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canRead(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const where = cfg.scope ? await cfg.scope(user, prisma) : {};
  let rows = await prisma[cfg.model].findMany({ where, orderBy: cfg.orderBy });
  if (cfg.sanitize) rows = rows.map(r => cfg.sanitize(r, user));
  return NextResponse.json(rows);
}

export async function POST(req, { params }) {
  const user = await apiUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized — thiếu hoặc sai Bearer API key' }, { status: 401 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canWrite(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let data = await req.json();
  if (cfg.beforeCreate) data = await cfg.beforeCreate(data, user, prisma);
  try {
    const icp = await interceptWrite(params.resource, null, data, user);
    if (icp?.block) return NextResponse.json({ _blocked: true, _notice: icp.block });
    if (icp?.data) data = icp.data;
    const row = await prisma[cfg.model].create({ data });
    await audit(user, 'create', params.resource, row.id, row.name || row.title || row.code || null);
    if (icp?.after) await icp.after(row);
    await emitEvent(params.resource, 'create', row, null, user);
    const out = cfg.sanitize ? cfg.sanitize(row, user) : row;
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
