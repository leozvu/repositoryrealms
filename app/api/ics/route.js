// v3.3: Trả link ICS cá nhân của người đang đăng nhập (token = HMAC theo user id,
// không lưu DB — thu hồi bằng cách đổi NEXTAUTH_SECRET)
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { icsToken } from '@/lib/ics';

export async function GET(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const base = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  return NextResponse.json({ url: `${base}/api/ics/${icsToken(user.id)}` });
}
