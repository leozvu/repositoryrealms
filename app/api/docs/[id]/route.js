// v3.37: tải xuống / xóa một tài liệu công ty.
// GET → trả file (Content-Disposition attachment). DELETE → người upload hoặc Giám đốc.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { isFreelancer, isDirector } from '@/lib/perm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function guard() {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 }) };
  if (isFreelancer(user)) return { error: NextResponse.json({ error: 'Freelancer không truy cập được kho tài liệu nội bộ' }, { status: 403 }) };
  return { user };
}

export async function GET(_req, { params }) {
  const { error } = await guard();
  if (error) return error;
  const { id } = await params;
  const doc = await prisma.companyDoc.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: 'Không tìm thấy tài liệu' }, { status: 404 });
  return new NextResponse(Buffer.from(doc.data), {
    headers: {
      'Content-Type': doc.mime,
      'Content-Length': String(doc.size),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function DELETE(_req, { params }) {
  const { user, error } = await guard();
  if (error) return error;
  const { id } = await params;
  const doc = await prisma.companyDoc.findUnique({ where: { id }, select: { id: true, name: true, uploadedById: true } });
  if (!doc) return NextResponse.json({ error: 'Không tìm thấy tài liệu' }, { status: 404 });
  if (doc.uploadedById !== user.id && !isDirector(user)) {
    return NextResponse.json({ error: 'Chỉ người upload hoặc Giám đốc được xóa tài liệu này' }, { status: 403 });
  }
  await prisma.companyDoc.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'delete', entity: 'companydocs', refId: id, detail: `Xóa ${doc.name}` } });
  return NextResponse.json({ ok: true });
}
