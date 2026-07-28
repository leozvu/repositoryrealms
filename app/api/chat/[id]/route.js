import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';

async function membership(convId, userId) {
  return prisma.convMember.findUnique({ where: { convId_userId: { convId, userId } } });
}

// GET: 100 tin gần nhất (?after=ISO chỉ lấy tin mới) + đánh dấu đã đọc
export async function GET(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const mem = await membership(params.id, user.id);
  if (!mem) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const after = new URL(req.url).searchParams.get('after');
  const [conv, messages, members, users] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: params.id } }),
    prisma.message.findMany({
      where: { convId: params.id, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
      orderBy: { createdAt: 'asc' }, take: 200,
    }),
    prisma.convMember.findMany({ where: { convId: params.id } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  await prisma.convMember.update({ where: { id: mem.id }, data: { lastReadAt: new Date() } });
  if (messages.some((message) => message.senderId !== user.id && message.createdAt > mem.lastReadAt)) {
    await safelyPublishRealmChange(prisma, {
      resource: 'messages', action: 'read', actorId: user.id, audienceUserId: user.id,
    });
  }
  const uName = id => users.find(u => u.id === id)?.name || '—';
  return NextResponse.json({
    conv: { id: conv.id, type: conv.type, name: conv.type === 'dm' ? uName(members.find(m => m.userId !== user.id)?.userId) : conv.name,
      members: members.map(m => uName(m.userId)) },
    messages: messages.slice(-100).map(m => ({ id: m.id, senderId: m.senderId, senderName: uName(m.senderId), content: m.content, at: m.createdAt })),
  });
}

// POST: gửi tin nhắn
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const mem = await membership(params.id, user.id);
  if (!mem) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Tin nhắn trống' }, { status: 400 });
  if (content.length > 4000) return NextResponse.json({ error: 'Tin nhắn quá dài (tối đa 4000 ký tự)' }, { status: 400 });
  const msg = await prisma.message.create({ data: { convId: params.id, senderId: user.id, content: content.trim() } });
  await prisma.convMember.update({ where: { id: mem.id }, data: { lastReadAt: new Date() } });
  const recipients = await prisma.convMember.findMany({
    where: { convId: params.id, userId: { not: user.id } }, select: { userId: true },
  });
  await Promise.all(recipients.map(({ userId: audienceUserId }) => safelyPublishRealmChange(prisma, {
    resource: 'messages', action: 'create', actorId: user.id, audienceUserId,
  })));
  return NextResponse.json({ id: msg.id, senderId: msg.senderId, senderName: user.name, content: msg.content, at: msg.createdAt });
}
