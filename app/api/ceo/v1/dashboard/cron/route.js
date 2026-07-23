// Đợt 1+2 tối ưu CEO Terminal: cron định kỳ (Vercel Cron) — không cần CEO mở trang.
// 1. Force-refresh snapshot 4 công ty → số liệu không bao giờ "chết" quá hạn 24h.
// 2. Cảnh báo chuông khi công ty mất kết nối (circuit open / lỗi liên tiếp).
// 3. Thứ Hai: digest tuần vào chuông thông báo.
// 4. Nhắc xoay service key trước hạn (env CEO_SERVICE_KEY_EXPIRES_AT, nhắc trước 14 ngày).
// Bảo vệ: Vercel Cron gửi Authorization: Bearer <CRON_SECRET> — sai/thiếu là 401.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/events';
import { refreshCeoUnifiedDashboard } from '@/lib/ceo-unified-dashboard-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET || '';
  const auth = request.headers.get('authorization') || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  }

  // Chạy dưới danh nghĩa Director hệ thống (tài khoản CEO đầu tiên của portal)
  const director = await prisma.user.findFirst({
    where: { status: 'active', OR: [{ role: 'DIRECTOR' }, { roles: { contains: 'DIRECTOR' } }] },
    orderBy: { createdAt: 'asc' },
  });
  if (!director) return NextResponse.json({ error: 'no director account' }, { status: 500 });
  const directorIds = (await prisma.user.findMany({
    where: { status: 'active', OR: [{ role: 'DIRECTOR' }, { roles: { contains: 'DIRECTOR' } }] },
    select: { id: true },
  })).map(u => u.id);

  const result = { refreshed: null, alerts: 0, digest: false, keyWarning: false };
  const nowVN = new Date(Date.now() + 7 * 3600_000); // giờ VN cho digest thứ Hai

  // 1. Force refresh toàn bộ snapshot
  try {
    const refresh = await refreshCeoUnifiedDashboard(prisma, director, { entityId: 'all', force: true });
    result.refreshed = { ok: refresh?.refreshed?.length ?? refresh?.succeeded ?? 'done', failed: refresh?.failed ?? 0 };
  } catch (error) {
    result.refreshed = { error: error?.code || 'refresh_failed' };
  }

  // 2. Cảnh báo công ty mất kết nối
  const troubled = await prisma.ceoEntityRegistry.findMany({
    where: { enabled: true, OR: [{ circuitState: { not: 'closed' } }, { consecutiveErrors: { gte: 3 } }] },
    select: { id: true, displayName: true, circuitState: true, consecutiveErrors: true, lastErrorCode: true },
  });
  for (const entity of troubled) {
    await notify(directorIds,
      `⚠ ${entity.displayName}: mất kết nối số liệu (${entity.lastErrorCode || entity.circuitState}, ${entity.consecutiveErrors} lỗi liên tiếp) — mở Danh bạ công ty để kiểm tra`,
      '/ceo-registry');
    result.alerts += 1;
  }

  // 3. Digest sáng thứ Hai (một lần mỗi tuần — cron chạy 1 lần/ngày nên không lặp trong ngày)
  if (nowVN.getUTCDay() === 1) {
    const caches = await prisma.ceoEntitySnapshotCache.findMany({ select: { entityId: true, fetchedAt: true } });
    const fresh = caches.filter(c => Date.now() - new Date(c.fetchedAt).getTime() < 26 * 3600_000).length;
    await notify(directorIds,
      `📈 Digest tuần: ${fresh}/${caches.length} công ty có số liệu mới trong 24h · mở Tổng quan để xem chi tiết doanh thu/việc trễ từng công ty`,
      '/ceo-overview');
    result.digest = true;
  }

  // 4. Nhắc xoay service key trước hạn
  const expiresAt = Date.parse(process.env.CEO_SERVICE_KEY_EXPIRES_AT || '');
  if (Number.isFinite(expiresAt)) {
    const daysLeft = Math.ceil((expiresAt - Date.now()) / 86400000);
    if (daysLeft <= 14) {
      await notify(directorIds,
        `🔑 Service key các công ty hết hạn sau ${daysLeft} ngày — chạy xoay key theo runbook (scripts/mint-ceo-service-key.mjs) rồi cập nhật env terminal`,
        '/ceo-security');
      result.keyWarning = true;
    }
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...result });
}
