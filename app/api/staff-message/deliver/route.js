// v3.40 (Đợt 3c) — CÔNG TY ĐÍCH: nhận tin nhắn liên công ty do portal chuyển tiếp và
// tạo bản ghi chat + thông báo NGAY TRONG hệ thống của mình (portal không ghi vào đây).
// Xác thực bằng service key scoped của chính công ty này.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/events';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';
import { STAFF_MESSAGE_MAX_LENGTH } from '@/lib/ceo-staff-bridge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function POST(request) {
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.STAFF_MESSAGE, headers);
  if (service.response) return service.response;
  try {
    const body = await request.json().catch(() => ({}));
    const recipientEmail = String(body.recipientEmail || '').toLowerCase();
    const text = String(body.body || '').trim().slice(0, STAFF_MESSAGE_MAX_LENGTH);
    const sourceLabel = String(body.sourceDisplayName || body.sourceEntityId || 'công ty khác').slice(0, 80);
    const senderLabel = String(body.senderEmail || '').slice(0, 120);
    if (!text) return NextResponse.json({ error: 'Nội dung trống.', code: 'staff_message_empty' }, { status: 400, headers });

    const recipient = await prisma.user.findUnique({ where: { email: recipientEmail }, select: { id: true, status: true, userType: true } });
    if (!recipient || recipient.status !== 'active' || recipient.userType === 'freelancer') {
      return NextResponse.json({ error: 'Người nhận không khả dụng.', code: 'staff_message_recipient_unavailable' }, { status: 404, headers });
    }

    // Hội thoại liên công ty dùng chính hệ chat ERP sẵn có, đặt tên rõ nguồn để người
    // nhận biết đây là tin từ công ty khác trong group.
    const title = `Liên công ty · ${sourceLabel}`;
    let conversation = await prisma.conversation.findFirst({ where: { type: 'group', name: title } });
    if (!conversation) {
      conversation = await prisma.conversation.create({ data: { type: 'group', name: title } });
    }
    // người nhận phải là thành viên hội thoại thì mới thấy trong trang Tin nhắn
    await prisma.convMember.upsert({
      where: { convId_userId: { convId: conversation.id, userId: recipient.id } },
      update: {},
      create: { convId: conversation.id, userId: recipient.id },
    }).catch(() => {});
    const message = await prisma.message.create({
      data: {
        convId: conversation.id,
        senderId: recipient.id, // hệ chat nội bộ yêu cầu người gửi là tài khoản local
        content: `[${senderLabel} · ${sourceLabel}] ${text}`,
      },
    }).catch(() => null);

    await notify([recipient.id], `✉ Tin nhắn từ ${sourceLabel}: ${text.slice(0, 90)}`, `/messages?conversation=${conversation.id}`);
    await prisma.auditLog.create({ data: {
      userId: recipient.id, userName: recipientEmail, action: 'staff_message_received',
      entity: 'messages', refId: conversation.id, detail: `từ ${senderLabel} (${sourceLabel})`,
    } }).catch(() => {});

    return NextResponse.json({ delivered: true, conversationId: conversation.id, messageId: message?.id || null }, { headers: service.responseHeaders || headers });
  } catch (error) {
    console.error('staff_message_deliver_failed', { name: error?.name });
    return NextResponse.json({ error: 'Không nhận được tin nhắn.', code: 'staff_message_failed' }, { status: 503, headers });
  }
}
