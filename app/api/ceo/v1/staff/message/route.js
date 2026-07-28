// v3.40 (Đợt 3c) — PORTAL: chuyển tiếp tin nhắn NHÂN SỰ ↔ NHÂN SỰ giữa hai công ty.
// Công ty nguồn gửi thay nhân sự của mình; portal chỉ chuyển tiếp, công ty đích tự tạo
// bản ghi chat + thông báo. Không mở thêm quyền xem dữ liệu nào ở hai phía.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CeoStaffError } from '@/lib/ceo-staff-bridge';
import { authenticateEntityCaller, relayStaffMessage } from '@/lib/ceo-staff-bridge-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function POST(request) {
  try {
    const sourceEntityId = authenticateEntityCaller(request);
    const body = await request.json().catch(() => ({}));
    const result = await relayStaffMessage(prisma, {
      sourceEntityId,
      targetEntityId: String(body.targetEntityId || '').trim().toLowerCase(),
      senderEmail: body.senderEmail,
      recipientEmail: body.recipientEmail,
      body: body.body,
    }, { secretResolver: (name) => process.env[name] || '' });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const known = error instanceof CeoStaffError;
    if (!known) console.error('ceo_staff_message_failed', { name: error?.name, code: error?.code });
    return NextResponse.json(
      { error: known ? error.message : 'Không chuyển tiếp được tin nhắn.', code: known ? error.code : 'ceo_staff_unavailable' },
      { status: known ? error.status : 503, headers },
    );
  }
}
