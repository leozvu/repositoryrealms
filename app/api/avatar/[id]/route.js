// v3.38: trả ảnh avatar của một người — mọi người trong công ty xem được (như thấy tên nhau).
// 404 khi chưa có ảnh → UI tự fallback về chữ cái đầu.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const row = await prisma.user.findUnique({ where: { id }, select: { avatar: true, avatarMime: true } });
  if (!row?.avatar) return NextResponse.json({ error: 'no avatar' }, { status: 404 });
  return new NextResponse(Buffer.from(row.avatar), {
    headers: {
      'Content-Type': row.avatarMime || 'image/jpeg',
      // private: ảnh nội bộ; cache 5 phút + version bust qua ?v=
      'Cache-Control': 'private, max-age=300',
    },
  });
}
