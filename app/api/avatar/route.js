// v3.38: Avatar thật — mỗi người tự upload ảnh của MÌNH (yêu cầu "thay NPC/chữ cái đầu
// bằng avatar thật từng người"). POST multipart {file} ≤512KB, định dạng jpeg/png/webp.
// Giám đốc/HR được upload hộ người khác qua field userId (onboarding nhân sự mới).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, isDirector } from '@/lib/perm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SIZE = 512 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  let form;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: 'Cần multipart/form-data kèm file ảnh' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Thiếu file ảnh' }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Chỉ nhận JPEG/PNG/WebP' }, { status: 415 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Ảnh vượt 512KB — hãy crop/nén nhỏ lại' }, { status: 413 });
  if (!file.size) return NextResponse.json({ error: 'File rỗng' }, { status: 400 });

  const targetId = String(form.get('userId') || user.id);
  if (targetId !== user.id && !isDirector(user) && !hasAny(user, ['HR'])) {
    return NextResponse.json({ error: 'Chỉ đổi được avatar của chính mình (GĐ/HR đổi hộ được)' }, { status: 403 });
  }
  const data = Buffer.from(await file.arrayBuffer());
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { avatar: data, avatarMime: file.type, avatarVersion: { increment: 1 } },
    select: { id: true, avatarVersion: true },
  }).catch(() => null);
  if (!updated) return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'update', entity: 'users', refId: targetId, detail: 'Đổi avatar' } });
  return NextResponse.json({ ok: true, avatarVersion: updated.avatarVersion });
}

export async function DELETE(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const targetId = new URL(request.url).searchParams.get('userId') || user.id;
  if (targetId !== user.id && !isDirector(user) && !hasAny(user, ['HR'])) {
    return NextResponse.json({ error: 'Chỉ xóa được avatar của chính mình' }, { status: 403 });
  }
  await prisma.user.update({ where: { id: targetId }, data: { avatar: null, avatarMime: null, avatarVersion: { increment: 1 } } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
