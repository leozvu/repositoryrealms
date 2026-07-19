import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_REPORT_BYTES = 16 * 1024;
const REPORT_LIMIT = 10;
const REPORT_WINDOW_MS = 60 * 1000;
const rateBuckets = globalThis.__crmegoricClientErrorBuckets || new Map();
globalThis.__crmegoricClientErrorBuckets = rateBuckets;

function json(payload, status = 200, headers = {}) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function consumeReportQuota(userId, now = Date.now()) {
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.startedAt >= REPORT_WINDOW_MS) rateBuckets.delete(key);
  }
  const current = rateBuckets.get(userId);
  if (!current || now - current.startedAt >= REPORT_WINDOW_MS) {
    rateBuckets.set(userId, { count: 1, startedAt: now });
    return true;
  }
  if (current.count >= REPORT_LIMIT) return false;
  current.count += 1;
  return true;
}

// Phase 0: nhận lỗi client (trang trắng / crash render) từ error boundary → ghi vào Nhật ký hệ
// thống để Giám đốc thấy NGAY, thay vì đợi người dùng báo. Nhiều bug trước đây (DocEditor trắng,
// ModulesCtx) chỉ người dùng phát hiện. Chỉ nhận từ phiên đã xác thực và giới hạn tần suất để
// AuditLog không trở thành một endpoint ghi dữ liệu công khai.
export async function POST(req) {
  const user = await currentUser().catch(() => null);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_REPORT_BYTES) return json({ error: 'payload_too_large' }, 413);
  if (!consumeReportQuota(user.id)) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REPORT_BYTES) return json({ error: 'payload_too_large' }, 413);
    const { message, stack, url } = raw ? JSON.parse(raw) : {};
    const detail = [String(message || 'Lỗi không rõ').slice(0, 400), stack ? String(stack).slice(0, 600) : '']
      .filter(Boolean).join(' | ');
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: 'client_error', entity: 'client',
        refId: String(url || '').slice(0, 200) || null,
        detail,
      },
    });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'invalid_json' }, 400);
    // Ghi log lỗi mà cũng lỗi thì trả trạng thái thất bại; client error boundary không retry tự động.
    return json({ ok: false }, 503);
  }
}
