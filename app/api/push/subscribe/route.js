// v3.40: đăng ký / hủy thiết bị nhận thông báo nền.
// POST {endpoint, device?} · DELETE ?endpoint=...
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const endpoint = String(body.endpoint || '').trim();
  if (!/^https:\/\/[^\s]{20,600}$/.test(endpoint)) {
    return NextResponse.json({ error: 'endpoint không hợp lệ' }, { status: 400 });
  }
  const device = String(body.device || '').slice(0, 120) || null;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, device },
    create: { userId: user.id, endpoint, device },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get('endpoint') || '';
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
}
