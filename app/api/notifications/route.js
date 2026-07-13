// v3.5: Thông báo trong app — mỗi người chỉ thấy của mình
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rows = await prisma.notification.findMany({
    where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 30,
  });
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return NextResponse.json({ rows, unread });
}

// PUT {id} đánh dấu 1 cái đã đọc · {all:true} đọc tất cả
export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id, all } = await req.json().catch(() => ({}));
  if (all) await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  else if (id) await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
