import {
  COLLABORATION_CONTACT_TTL_MS,
  COLLABORATION_PRESENCE_TTL_MS,
  CollaborationError,
  collaborationContactLabel,
  collaborationContactRoute,
  mergeCollaborationDirectory,
  normalizeCollaborationAvailability,
  normalizeCollaborationCapabilities,
  normalizeCollaborationContactKind,
  normalizeCollaborationContactMessage,
  normalizeCollaborationIdempotencyKey,
  normalizeCollaborationSessionId,
  normalizeCollaborationSurface,
  normalizeCollaborationUserId,
  serializeCollaborationContact,
} from './collaboration.js';
import { safelyPublishRealmChange } from './realm-change-feed.js';

const CONTACT_RATE_WINDOW_MS = 10 * 60_000;
const CONTACT_RATE_LIMIT = 5;
const REUSE_PENDING_MS = 30_000;

async function directConversation(db, requesterId, targetId) {
  const mine = await db.convMember.findMany({ where: { userId: requesterId }, select: { convId: true } });
  if (mine.length) {
    const theirs = await db.convMember.findMany({
      where: { userId: targetId, convId: { in: mine.map((row) => row.convId) } },
      select: { convId: true },
    });
    if (theirs.length) {
      const conversation = await db.conversation.findFirst({
        where: { id: { in: theirs.map((row) => row.convId) }, type: 'dm' },
        select: { id: true },
      });
      if (conversation) return conversation;
    }
  }
  const conversation = await db.conversation.create({ data: { type: 'dm' }, select: { id: true } });
  await db.convMember.createMany({ data: [{ convId: conversation.id, userId: requesterId }, { convId: conversation.id, userId: targetId }] });
  return conversation;
}

export async function heartbeatCollaborationPresence(db, user, input = {}, now = new Date()) {
  if (!user?.id) throw new CollaborationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const sessionId = normalizeCollaborationSessionId(input.sessionId);
  const surface = normalizeCollaborationSurface(input.surface);
  const availability = normalizeCollaborationAvailability(input.availability);
  const capabilities = normalizeCollaborationCapabilities(input.capabilities);
  const owner = await db.collaborationPresenceSession.findUnique({ where: { sessionId }, select: { userId: true } });
  if (owner && owner.userId !== user.id) {
    throw new CollaborationError('Session hiện diện đã thuộc về tài khoản khác.', 409, 'presence_session_conflict');
  }
  const row = await db.collaborationPresenceSession.upsert({
    where: { sessionId },
    create: { sessionId, userId: user.id, surface, availability, capabilities: JSON.stringify(capabilities), lastSeen: now },
    update: { surface, availability, capabilities: JSON.stringify(capabilities), lastSeen: now },
  });
  return { sessionId: row.sessionId, surface, availability, capabilities, lastSeen: now.toISOString() };
}

export async function leaveCollaborationPresence(db, user, input = {}) {
  if (!user?.id) throw new CollaborationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const sessionId = normalizeCollaborationSessionId(input.sessionId);
  await db.collaborationPresenceSession.deleteMany({ where: { sessionId, userId: user.id } });
  return { ok: true };
}

export async function loadCollaborationDirectory(db, user, now = new Date()) {
  if (!user?.id) throw new CollaborationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const threshold = new Date(now.getTime() - COLLABORATION_PRESENCE_TTL_MS);
  const [users, sessions] = await Promise.all([
    db.user.findMany({
      where: { status: 'active', userType: 'employee' },
      select: { id: true, name: true, title: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    db.collaborationPresenceSession.findMany({
      where: { lastSeen: { gte: threshold } },
      select: { userId: true, surface: true, availability: true, capabilities: true, lastSeen: true },
      take: 2000,
    }),
  ]);
  const people = mergeCollaborationDirectory({ users, sessions, selfUserId: user.id, now });
  return {
    generatedAt: now.toISOString(),
    ttlMs: COLLABORATION_PRESENCE_TTL_MS,
    people,
    onlineUsers: people.filter((person) => person.online).length,
  };
}

export async function requestCollaborationContact(db, user, input = {}, now = new Date()) {
  if (!user?.id) throw new CollaborationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const targetId = normalizeCollaborationUserId(input.targetUserId);
  if (targetId === user.id) throw new CollaborationError('Không thể tự gửi lời mời cho chính mình.', 400, 'self_contact');
  const idempotencyKey = normalizeCollaborationIdempotencyKey(input.idempotencyKey);
  const kind = normalizeCollaborationContactKind(input.kind);
  const sourceSurface = normalizeCollaborationSurface(input.sourceSurface, 'realm');
  const message = normalizeCollaborationContactMessage(input.message);

  const duplicate = await db.collaborationContactRequest.findUnique({
    where: { idempotencyKey },
    include: { requester: { select: { name: true } }, target: { select: { name: true } } },
  });
  if (duplicate) {
    if (duplicate.requesterId !== user.id) throw new CollaborationError('Idempotency key đã được sử dụng.', 409, 'idempotency_conflict');
    return { contact: serializeCollaborationContact(duplicate, user.id), duplicate: true };
  }

  const target = await db.user.findFirst({
    where: { id: targetId, status: 'active', userType: 'employee' },
    select: { id: true, name: true },
  });
  if (!target) throw new CollaborationError('Không tìm thấy nhân sự đang hoạt động.', 404, 'contact_target_missing');

  const presenceThreshold = new Date(now.getTime() - COLLABORATION_PRESENCE_TTL_MS);
  const targetSessions = await db.collaborationPresenceSession.findMany({
    where: { userId: targetId, lastSeen: { gte: presenceThreshold } },
    select: { availability: true },
  });
  if (targetSessions.some((session) => session.availability === 'dnd')) {
    throw new CollaborationError(`${target.name} đang bật Không làm phiền. Hãy gửi tin trong Lantern Mail.`, 409, 'target_dnd');
  }

  const recentPending = await db.collaborationContactRequest.findFirst({
    where: {
      requesterId: user.id,
      targetId,
      kind,
      status: 'pending',
      createdAt: { gte: new Date(now.getTime() - REUSE_PENDING_MS) },
      expiresAt: { gt: now },
    },
    include: { requester: { select: { name: true } }, target: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (recentPending) return { contact: serializeCollaborationContact(recentPending, user.id), duplicate: true };

  const recentCount = await db.collaborationContactRequest.count({
    where: { requesterId: user.id, targetId, createdAt: { gte: new Date(now.getTime() - CONTACT_RATE_WINDOW_MS) } },
  });
  if (recentCount >= CONTACT_RATE_LIMIT) {
    throw new CollaborationError('Bạn đã gửi quá nhiều lời mời tới người này. Hãy chờ vài phút.', 429, 'contact_rate_limited');
  }

  const expiresAt = new Date(now.getTime() + COLLABORATION_CONTACT_TTL_MS);
  let created;
  try {
    created = await db.$transaction(async (tx) => {
      const conversation = await directConversation(tx, user.id, targetId);
      const contact = await tx.collaborationContactRequest.create({
        data: {
          requesterId: user.id,
          targetId,
          conversationId: conversation.id,
          kind,
          sourceSurface,
          status: 'pending',
          message: message || null,
          idempotencyKey,
          expiresAt,
          createdAt: now,
        },
      });
      const route = collaborationContactRoute(conversation.id, contact.id);
      const requestText = message || 'Muốn trao đổi nhanh với bạn.';
      await tx.message.create({
        data: { convId: conversation.id, senderId: user.id, content: `[Gõ cửa từ ${sourceSurface === 'realm' ? 'Realm' : 'ERP'}] ${requestText}` },
      });
      await tx.notification.create({
        data: { userId: targetId, text: `${user.name || 'Một đồng nghiệp'} ${collaborationContactLabel(kind)} từ ${sourceSurface === 'realm' ? 'Realm' : 'ERP'}.`, route },
      });
      return { ...contact, requesterName: user.name, targetName: target.name };
    });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await db.collaborationContactRequest.findUnique({
      where: { idempotencyKey },
      include: { requester: { select: { name: true } }, target: { select: { name: true } } },
    });
    if (!raced || raced.requesterId !== user.id) throw error;
    return { contact: serializeCollaborationContact(raced, user.id), duplicate: true };
  }
  await safelyPublishRealmChange(db, {
    resource: 'collaboration', action: 'request', actorId: user.id, audienceUserId: targetId,
  });
  return { contact: serializeCollaborationContact(created, user.id), duplicate: false };
}

export async function loadCollaborationContacts(db, user, now = new Date()) {
  if (!user?.id) throw new CollaborationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  await db.collaborationContactRequest.updateMany({
    where: { status: 'pending', expiresAt: { lte: now } },
    data: { status: 'expired', actionAt: now },
  });
  const [incoming, outgoing] = await Promise.all([
    db.collaborationContactRequest.findMany({
      where: { targetId: user.id, status: 'pending', expiresAt: { gt: now } },
      include: { requester: { select: { name: true } }, target: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.collaborationContactRequest.findMany({
      where: { requesterId: user.id, createdAt: { gte: new Date(now.getTime() - 30 * 60_000) } },
      include: { requester: { select: { name: true } }, target: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  return {
    generatedAt: now.toISOString(),
    incoming: incoming.map((row) => serializeCollaborationContact(row, user.id)),
    outgoing: outgoing.map((row) => serializeCollaborationContact(row, user.id)),
  };
}

export async function respondCollaborationContact(db, user, input = {}, now = new Date()) {
  if (!user?.id) throw new CollaborationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const contactId = String(input.id || '').trim();
  if (!contactId) throw new CollaborationError('Thiếu contact request.', 400, 'contact_id_required');
  const action = String(input.action || '').trim().toLowerCase();
  if (!['seen', 'accept', 'decline'].includes(action)) throw new CollaborationError('Phản hồi không hợp lệ.', 400, 'invalid_contact_action');
  const contact = await db.collaborationContactRequest.findFirst({
    where: { id: contactId, targetId: user.id },
    include: { requester: { select: { name: true } }, target: { select: { name: true } } },
  });
  if (!contact) throw new CollaborationError('Lời mời không tồn tại hoặc không thuộc về bạn.', 404, 'contact_missing');
  if (contact.status !== 'pending') return { contact: serializeCollaborationContact(contact, user.id), duplicate: true };
  if (contact.expiresAt <= now) {
    const expired = await db.collaborationContactRequest.update({
      where: { id: contact.id }, data: { status: 'expired', actionAt: now },
      include: { requester: { select: { name: true } }, target: { select: { name: true } } },
    });
    throw new CollaborationError(`Lời mời đã hết hạn lúc ${expired.expiresAt.toISOString()}.`, 410, 'contact_expired');
  }
  if (action === 'seen') {
    const seen = await db.collaborationContactRequest.update({
      where: { id: contact.id }, data: { seenAt: contact.seenAt || now },
      include: { requester: { select: { name: true } }, target: { select: { name: true } } },
    });
    return { contact: serializeCollaborationContact(seen, user.id), duplicate: false };
  }

  const status = action === 'accept' ? 'accepted' : 'declined';
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.collaborationContactRequest.update({
      where: { id: contact.id },
      data: { status, seenAt: contact.seenAt || now, actionAt: now },
      include: { requester: { select: { name: true } }, target: { select: { name: true } } },
    });
    await tx.notification.create({
      data: {
        userId: contact.requesterId,
        text: `${user.name || 'Đồng nghiệp'} đã ${status === 'accepted' ? 'mở cuộc trò chuyện' : 'từ chối lời mời'} của bạn.`,
        route: status === 'accepted' ? collaborationContactRoute(contact.conversationId, contact.id) : '/messages',
      },
    });
    return next;
  });
  await Promise.all([user.id, contact.requesterId].map(audienceUserId => safelyPublishRealmChange(db, {
    resource: 'collaboration', action: status, actorId: user.id, audienceUserId,
  })));
  return { contact: serializeCollaborationContact(updated, user.id), duplicate: false };
}
