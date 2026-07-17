import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';

// Phase 0: nhận lỗi client (trang trắng / crash render) từ error boundary → ghi vào Nhật ký hệ
// thống để Giám đốc thấy NGAY, thay vì đợi người dùng báo. Nhiều bug trước đây (DocEditor trắng,
// ModulesCtx) chỉ người dùng phát hiện. Không cần dịch vụ ngoài (Sentry) — tận dụng AuditLog sẵn có.
export async function POST(req) {
  try {
    const { message, stack, url } = await req.json().catch(() => ({}));
    const user = await currentUser().catch(() => null);
    const detail = [String(message || 'Lỗi không rõ').slice(0, 400), stack ? String(stack).slice(0, 600) : '']
      .filter(Boolean).join(' | ');
    await prisma.auditLog.create({
      data: {
        userId: user?.id || 'system',
        userName: user?.name || '(khách chưa đăng nhập)',
        action: 'client_error', entity: 'client',
        refId: String(url || '').slice(0, 200) || null,
        detail,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    // Ghi log lỗi mà cũng lỗi thì nuốt — không để vòng lặp lỗi.
    return NextResponse.json({ ok: false });
  }
}
