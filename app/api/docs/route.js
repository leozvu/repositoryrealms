// v3.37: Tài liệu công ty — kho tài sản số nội bộ (feedback Egoric 07/2026).
// GET  /api/docs      → danh sách (không kèm nội dung file)
// POST /api/docs      → upload (multipart/form-data: file, category?, note?) — cap 4MB
// Nhân viên nội bộ: xem + tải + upload. Freelancer: chặn hoàn toàn (tài liệu nội bộ).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { isFreelancer } from '@/lib/perm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SIZE = 4 * 1024 * 1024; // Vercel serverless nhận body ~4.5MB — chừa lề an toàn

async function guard() {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 }) };
  if (isFreelancer(user)) return { error: NextResponse.json({ error: 'Freelancer không truy cập được kho tài liệu nội bộ' }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const { user, error } = await guard();
  if (error) return error;
  const docs = await prisma.companyDoc.findMany({
    select: { id: true, name: true, category: true, mime: true, size: true, note: true, uploadedById: true, uploadedBy: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(docs, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request) {
  const { user, error } = await guard();
  if (error) return error;
  let form;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: 'Cần gửi multipart/form-data kèm file' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File vượt 4MB — file lớn hãy dùng "Gắn tài liệu" dán link Drive/Notion' }, { status: 413 });
  if (!file.size) return NextResponse.json({ error: 'File rỗng' }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const doc = await prisma.companyDoc.create({
    data: {
      name: String(file.name || 'tai-lieu').slice(0, 200),
      category: String(form.get('category') || '').slice(0, 60) || null,
      note: String(form.get('note') || '').slice(0, 300) || null,
      mime: String(file.type || 'application/octet-stream').slice(0, 100),
      size: file.size,
      data,
      uploadedById: user.id,
      uploadedBy: user.name || user.email || '—',
    },
    select: { id: true, name: true, size: true },
  });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'create', entity: 'companydocs', refId: doc.id, detail: `Upload ${doc.name} (${Math.round(doc.size / 1024)}KB)` } });
  return NextResponse.json(doc, { status: 201 });
}
