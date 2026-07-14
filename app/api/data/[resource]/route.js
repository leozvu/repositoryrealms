import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { RESOURCES, canRead, canWrite } from '@/lib/registry';
import { isFreelancer } from '@/lib/perm';
import { interceptWrite } from '@/lib/approvals';
import { emitEvent } from '@/lib/events';

async function audit(user, action, entity, refId, detail) {
  await prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action, entity, refId: refId || null, detail: detail || null },
  });
}

export async function GET(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canRead(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const where = cfg.scope ? cfg.scope(user) : {};
  let rows = await prisma[cfg.model].findMany({ where, orderBy: cfg.orderBy });
  if (cfg.sanitize) rows = rows.map(r => cfg.sanitize(r, user));
  return NextResponse.json(rows);
}

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
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
    emitEvent(params.resource, 'create', row, null, user); // v3.3: webhook + rule tự động
    const notice = icp?.after ? await icp.after(row) : null;
    const out = cfg.sanitize ? cfg.sanitize(row, user) : row;
    return NextResponse.json(notice ? { ...out, _notice: notice } : out);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
