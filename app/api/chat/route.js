import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { isFreelancer } from '@/lib/perm';

// Đảm bảo kênh #Chung tồn tại và người gọi là thành viên
async function ensureGeneral(userId) {
  let gen = await prisma.conversation.findFirst({ where: { type: 'general' } });
  if (!gen) gen = await prisma.conversation.create({ data: { type: 'general', name: 'Kênh chung' } });
  const mem = await prisma.convMember.findUnique({ where: { convId_userId: { convId: gen.id, userId } } });
  if (!mem) await prisma.convMember.create({ data: { convId: gen.id, userId } });
  return gen;
}

// GET: danh sách hội thoại của tôi + tin cuối + số chưa đọc
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await ensureGeneral(user.id);
  const myMemberships = await prisma.convMember.findMany({ where: { userId: user.id } });
  const convIds = myMemberships.map(m => m.convId);
  const [convs, members, users] = await Promise.all([
    prisma.conversation.findMany({ where: { id: { in: convIds } } }),
    prisma.convMember.findMany({ where: { convId: { in: convIds } } }),
    prisma.user.findMany({ select: { id: true, name: true, title: true, status: true } }),
  ]);
  const uName = id => users.find(u => u.id === id)?.name || '—';
  const result = [];
  let totalUnread = 0;
  for (const c of convs) {
    const my = myMemberships.find(m => m.convId === c.id);
    const [lastMsg, unread] = await Promise.all([
      prisma.message.findFirst({ where: { convId: c.id }, orderBy: { createdAt: 'desc' } }),
      prisma.message.count({ where: { convId: c.id, createdAt: { gt: my.lastReadAt }, NOT: { senderId: user.id } } }),
    ]);
    totalUnread += unread;
    const others = members.filter(m => m.convId === c.id && m.userId !== user.id).map(m => m.userId);
    result.push({
      id: c.id, type: c.type,
      name: c.type === 'dm' ? uName(others[0]) : (c.name || 'Nhóm'),
      memberCount: others.length + 1,
      lastMsg: lastMsg ? { content: lastMsg.content.slice(0, 60), senderName: uName(lastMsg.senderId), at: lastMsg.createdAt } : null,
      unread,
    });
  }
  result.sort((a, b) => (a.type === 'general' ? -1 : b.type === 'general' ? 1 : (b.lastMsg?.at || 0) > (a.lastMsg?.at || 0) ? 1 : -1));
  return NextResponse.json({ conversations: result, totalUnread, directory: users.filter(u => u.status === 'active' && u.id !== user.id).map(({ id, name, title }) => ({ id, name, title })) });
}

// POST: tạo hội thoại — {type:'dm', userId} hoặc {type:'group', name, memberIds[]}
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { type, userId, name, memberIds } = await req.json();
  if (type === 'dm') {
    if (!userId || userId === user.id) return NextResponse.json({ error: 'Chọn người nhận' }, { status: 400 });
    // Tìm DM có sẵn giữa 2 người
    const mine = await prisma.convMember.findMany({ where: { userId: user.id }, select: { convId: true } });
    const theirs = await prisma.convMember.findMany({ where: { userId, convId: { in: mine.map(m => m.convId) } }, select: { convId: true } });
    for (const t of theirs) {
      const c = await prisma.conversation.findUnique({ where: { id: t.convId } });
      if (c?.type === 'dm') return NextResponse.json(c);
    }
    const conv = await prisma.conversation.create({ data: { type: 'dm' } });
    await prisma.convMember.createMany({ data: [{ convId: conv.id, userId: user.id }, { convId: conv.id, userId }] });
    return NextResponse.json(conv);
  }
  if (type === 'group') {
    const ids = [...new Set([user.id, ...(memberIds || [])])];
    if (!name?.trim() || ids.length < 2) return NextResponse.json({ error: 'Cần tên nhóm và ít nhất 1 thành viên khác' }, { status: 400 });
    const conv = await prisma.conversation.create({ data: { type: 'group', name: name.trim() } });
    await prisma.convMember.createMany({ data: ids.map(uid => ({ convId: conv.id, userId: uid })) });
    return NextResponse.json(conv);
  }
  return NextResponse.json({ error: 'type không hợp lệ' }, { status: 400 });
}
