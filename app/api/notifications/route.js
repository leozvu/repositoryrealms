// v3.5: Thông báo trong app — mỗi người chỉ thấy của mình
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';
import { normalizeNotificationRow } from '@/lib/notification-inbox';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Cookie' };

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS });
  const rows = await prisma.notification.findMany({
    where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 30,
  });
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return NextResponse.json({ rows: rows.map(normalizeNotificationRow), unread }, { headers: PRIVATE_HEADERS });
}

// PUT {id} đánh dấu 1 cái đã đọc · {all:true} đọc tất cả
export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS });
  const { id, all } = await req.json().catch(() => ({}));
  const notificationId = String(id ?? '').trim();
  if (!all && !/^[a-zA-Z0-9:_-]{1,100}$/.test(notificationId)) {
    return NextResponse.json({ error: 'notification_invalid' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const result = all
    ? await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } })
    : await prisma.notification.updateMany({ where: { id: notificationId, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  if (result.count > 0) {
    await safelyPublishRealmChange(prisma, {
      resource: 'notifications', action: all ? 'read_all' : 'read', entityId: all ? null : notificationId,
      actorId: user.id, audienceUserId: user.id,
    });
  }
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return NextResponse.json({ ok: true, changed: result.count, unread }, { headers: PRIVATE_HEADERS });
}
