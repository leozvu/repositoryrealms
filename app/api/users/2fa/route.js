// v3.2: Bật/tắt đăng nhập 2 lớp TOTP cho chính tài khoản đang đăng nhập
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { generateSecret, verifyTotp, otpauthURL } from '@/lib/totp';

async function audit(user, action, detail) {
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action, entity: '2fa', detail } });
}

// Trạng thái hiện tại + secret mới (chưa lưu) để bắt đầu bật
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { totpSecret: true, email: true } });
  const secret = generateSecret();
  return NextResponse.json({ enabled: !!row?.totpSecret, secret, url: otpauthURL(secret, row?.email || '') });
}

// Bật: xác nhận mã đúng với secret vừa hiển thị rồi mới lưu
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { secret, code } = await req.json();
  if (!secret || !verifyTotp(secret, code)) {
    return NextResponse.json({ error: 'Mã không đúng — kiểm tra lại ứng dụng xác thực' }, { status: 400 });
  }
  // updateMany: phiên cũ trỏ tới user đã xóa (VD sau re-seed) → 401 thay vì crash
  const { count } = await prisma.user.updateMany({ where: { id: user.id }, data: { totpSecret: secret } });
  if (!count) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await audit(user, 'update', 'Bật đăng nhập 2 lớp');
  return NextResponse.json({ ok: true });
}

// Tắt: phải nhập đúng mã hiện tại
export async function DELETE(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { code } = await req.json().catch(() => ({}));
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { totpSecret: true } });
  if (!row?.totpSecret) return NextResponse.json({ ok: true });
  if (!verifyTotp(row.totpSecret, code)) {
    return NextResponse.json({ error: 'Mã không đúng — cần mã hiện tại để tắt 2FA' }, { status: 400 });
  }
  await prisma.user.updateMany({ where: { id: user.id }, data: { totpSecret: null } });
  await audit(user, 'update', 'Tắt đăng nhập 2 lớp');
  return NextResponse.json({ ok: true });
}
