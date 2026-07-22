// v3.3: Quản lý API key — chỉ Giám đốc. Key thô chỉ trả về 1 lần lúc tạo.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { isDirector } from '@/lib/perm';
import { generateKey, hashKey } from '@/lib/apiauth';

async function guard() {
  const user = await currentUser();
  if (!user) return [null, NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 })];
  if (!isDirector(user)) return [null, NextResponse.json({ error: 'forbidden' }, { status: 403 })];
  return [user, null];
}

export async function GET() {
  const [, err] = await guard();
  if (err) return err;
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json(keys.map(({ keyHash, ...k }) => k)); // không lộ hash
}

export async function POST(req) {
  const [user, err] = await guard();
  if (err) return err;
  const { name, roles } = await req.json();
  if (!name) return NextResponse.json({ error: 'Cần tên key' }, { status: 400 });
  const raw = generateKey();
  const row = await prisma.apiKey.create({
    data: { name, prefix: raw.slice(0, 10), keyHash: hashKey(raw), roles: JSON.stringify(Array.isArray(roles) && roles.length ? roles : ['PM']) },
  });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'create', entity: 'apikeys', refId: row.id, detail: name } });
  return NextResponse.json({ id: row.id, key: raw }); // raw chỉ lần này
}

export async function PUT(req) { // bật/tắt key
  const [user, err] = await guard();
  if (err) return err;
  const { id, active } = await req.json();
  const row = await prisma.apiKey.update({ where: { id }, data: { active: !!active } });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'update', entity: 'apikeys', refId: id, detail: `${row.name}: ${active ? 'bật' : 'khóa'}` } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const [user, err] = await guard();
  if (err) return err;
  const { id } = await req.json();
  const row = await prisma.apiKey.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'delete', entity: 'apikeys', refId: id, detail: row.name } });
  return NextResponse.json({ ok: true });
}
