// v3.38: trả ảnh avatar của một người — mọi người trong công ty xem được (như thấy tên nhau).
// 404 khi chưa có ảnh → UI tự fallback về chữ cái đầu.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req, { params }) {
  // 204 (không phải 401/404) khi chưa đăng nhập hoặc chưa có ảnh: trình duyệt log console.error
  // cho MỌI request lỗi (kể cả fetch) — 204 giữ console sạch mà vẫn không lộ ảnh cho người lạ
  // (chỉ user đã đăng nhập + có ảnh mới nhận 200 kèm dữ liệu).
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  const { id } = await params;
  const row = await prisma.user.findUnique({ where: { id }, select: { avatar: true, avatarMime: true } });
  if (!row?.avatar) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, max-age=60' } });
  return new NextResponse(Buffer.from(row.avatar), {
    headers: {
      'Content-Type': row.avatarMime || 'image/jpeg',
      // private: ảnh nội bộ; cache 5 phút + version bust qua ?v=
      'Cache-Control': 'private, max-age=300',
    },
  });
}
