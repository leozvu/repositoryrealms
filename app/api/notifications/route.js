// v3.5: Thông báo trong app — mỗi người chỉ thấy của mình
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Cookie' };

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS });
  const rows = await prisma.notification.findMany({
    where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 30,
  });
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return NextResponse.json({ rows, unread }, { headers: PRIVATE_HEADERS });
}

// PUT {id} đánh dấu 1 cái đã đọc · {all:true} đọc tất cả
export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS });
  const { id, all } = await req.json().catch(() => ({}));
  if (all) await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  else if (id) await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  await safelyPublishRealmChange(prisma, {
    resource: 'notifications', action: all ? 'read_all' : 'read', actorId: user.id, audienceUserId: user.id,
  });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
