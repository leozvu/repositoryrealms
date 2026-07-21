import { isDirector, isFreelancer } from './perm.js';
import { normalizeNotificationDraft } from './notification-inbox.js';
import {
  CEO_DIRECTORY_CONTRACT,
  CEO_MESSAGE_FEED_CONTRACT,
  CEO_MESSAGE_RECEIPT_CONTRACT,
  CEO_MESSAGING_POLICY,
  CEO_MESSAGING_VERSION,
  CeoMessagingError,
  buildCeoDirectoryEnvelope,
  normalizeCeoMessageEnvelope,
} from './ceo-messaging.js';

function requireDirector(user) {
  if (!user) throw new CeoMessagingError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoMessagingError('Director API scope required.', 403, 'ceo_messaging_director_required');
}

function directoryProfile(profile) {
  return {
    userId: profile.user.id, email: profile.user.email,
    displayName: profile.user.name,
    title: profile.user.title || null,
    sharePresence: profile.sharePresence, updatedAt: profile.updatedAt,
  };
}

export async function getLocalCeoDirectoryProfile(db, user) {
  if (!user || isFreelancer(user)) throw new CeoMessagingError('Employee session required.', 403, 'ceo_messaging_employee_required');
  const [profile, local] = await Promise.all([
    db.ceoEntityDirectoryProfile.findUnique({ where: { userId: user.id } }),
    db.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, name: true, title: true, status: true } }),
  ]);
  if (!local || local.status !== 'active') throw new CeoMessagingError('Employee profile is unavailable.', 404, 'ceo_messaging_employee_unavailable');
  return {
    sharedWithCeoPortal: profile?.sharedWithCeoPortal === true,
    sharePresence: profile?.sharePresence === true,
    displayName: profile?.displayName || local.name,
    title: profile?.title || local.title || null,
    policyVersion: CEO_MESSAGING_POLICY.version,
    consentedAt: profile?.consentedAt || null,
    revokedAt: profile?.revokedAt || null,
  };
}

export async function updateLocalCeoDirectoryProfile(db, user, input = {}, now = new Date()) {
  if (!user || isFreelancer(user)) throw new CeoMessagingError('Employee session required.', 403, 'ceo_messaging_employee_required');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['sharedWithCeoPortal', 'sharePresence'].includes(key))) {
    throw new CeoMessagingError('Directory preference is invalid.', 400, 'ceo_messaging_directory_preference_invalid');
  }
  const shared = input.sharedWithCeoPortal === true;
  const presence = shared && input.sharePresence === true;
  await db.$transaction(async (tx) => {
    const [local, current] = await Promise.all([
      tx.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, title: true, status: true } }),
      tx.ceoEntityDirectoryProfile.findUnique({ where: { userId: user.id } }),
    ]);
    if (!local || local.status !== 'active') throw new CeoMessagingError('Employee profile is unavailable.', 404, 'ceo_messaging_employee_unavailable');
    await tx.ceoEntityDirectoryProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, sharedWithCeoPortal: shared, sharePresence: presence, displayName: local.name, title: local.title, consentedAt: shared ? now : null, revokedAt: shared ? null : now },
      update: { sharedWithCeoPortal: shared, sharePresence: presence, displayName: local.name, title: local.title, consentedAt: shared ? (current?.consentedAt || now) : undefined, revokedAt: shared ? null : now },
    });
    const action = !shared ? 'ceo_directory_share_revoked'
      : !current?.sharedWithCeoPortal ? 'ceo_directory_share_enabled'
        : current.sharePresence !== presence ? (presence ? 'ceo_presence_share_enabled' : 'ceo_presence_share_disabled') : 'ceo_directory_share_updated';
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action, entity: 'ceo_directory_profile', refId: user.id, detail: `policy=${CEO_MESSAGING_POLICY.version}; presence=${presence}` } });
  }, { isolationLevel: 'Serializable' });
  return getLocalCeoDirectoryProfile(db, user);
}

export async function buildLocalCeoDirectory(db, user, entity, asOf = new Date()) {
  requireDirector(user);
  const rows = await db.ceoEntityDirectoryProfile.findMany({
    where: { sharedWithCeoPortal: true, user: { status: 'active', userType: 'employee' } },
    include: { user: { select: { id: true, email: true, name: true, title: true } } },
    orderBy: { updatedAt: 'asc' }, take: 2_000,
  });
  return buildCeoDirectoryEnvelope({ entity, profiles: rows.map(directoryProfile), asOf });
}

function receiptEnvelope(receipt, replayed = false) {
  return {
    contract: CEO_MESSAGE_RECEIPT_CONTRACT, version: CEO_MESSAGING_VERSION,
    receipt: {
      id: receipt.id, targetEntityId: receipt.targetEntityId, actorSubject: receipt.actorSubject,
      portalConversationId: receipt.portalConversationId, correlationId: receipt.correlationId,
      localConversationId: receipt.localConversationId, localMessageId: receipt.localMessageId,
      committedAt: new Date(receipt.createdAt).toISOString(), replayed,
    },
  };
}

function receiptMatches(receipt, message) {
  return receipt && receipt.correlationId === message.correlationId && receipt.actorSubject === message.actorSubject
    && receipt.targetEntityId === message.targetEntityId && receipt.portalConversationId === message.portalConversationId
    && receipt.payloadHash === message.payloadHash;
}

async function replay(db, message) {
  const receipt = await db.ceoEntityMessageReceipt.findUnique({ where: { idempotencyKey: message.idempotencyKey } });
  if (!receipt) return null;
  if (!receiptMatches(receipt, message)) throw new CeoMessagingError('Message idempotency conflict.', 409, 'ceo_messaging_idempotency_conflict');
  return receipt;
}

async function resolveAudience(tx, message, ceoUser) {
  if (message.conversationType === 'dm') {
    const profile = await tx.ceoEntityDirectoryProfile.findUnique({ where: { userId: message.recipientUserId }, include: { user: true } });
    if (!profile?.sharedWithCeoPortal || profile.user.status !== 'active' || profile.user.userType !== 'employee') {
      throw new CeoMessagingError('Recipient is not shared with the CEO directory.', 422, 'ceo_messaging_recipient_unavailable');
    }
    return [profile.user];
  }
  const profiles = await tx.ceoEntityDirectoryProfile.findMany({
    where: { sharedWithCeoPortal: true, user: { status: 'active', userType: 'employee' } }, include: { user: true }, take: 500,
  });
  const users = profiles.map((row) => row.user).filter((row) => row.id !== ceoUser.id);
  if (!users.length) throw new CeoMessagingError('Entity channel has no shared recipients.', 422, 'ceo_messaging_audience_empty');
  return users;
}

async function resolveLocalDirector(tx, preferredEmail = null) {
  const users = await tx.user.findMany({ where: { status: 'active', userType: 'employee' }, select: { id: true, email: true, name: true, title: true, role: true, roles: true, status: true, userType: true }, take: 500 });
  const normalizedEmail = String(preferredEmail || '').trim().toLowerCase();
  const director = users.find((candidate) => normalizedEmail && candidate.email.toLowerCase() === normalizedEmail && isDirector(candidate))
    || users.find((candidate) => isDirector(candidate));
  if (!director) throw new CeoMessagingError('A local Director sender is required.', 422, 'ceo_messaging_local_director_unavailable');
  return director;
}

async function ensureLocalConversation(tx, message, ceoUser, recipients) {
  const existing = await tx.ceoEntityConversationLink.findUnique({ where: { portalConversationId: message.portalConversationId } });
  const memberIds = [...new Set([ceoUser.id, ...recipients.map((recipient) => recipient.id)])];
  if (existing) {
    if (existing.targetEntityId !== message.targetEntityId || existing.type !== message.conversationType || (existing.participantUserId || null) !== (message.recipientUserId || null)) {
      throw new CeoMessagingError('Conversation mapping conflict.', 409, 'ceo_messaging_conversation_conflict');
    }
    await tx.convMember.deleteMany({ where: { convId: existing.localConversationId, userId: { notIn: memberIds } } });
    await tx.convMember.createMany({ data: memberIds.map((userId) => ({ convId: existing.localConversationId, userId })), skipDuplicates: true });
    return existing;
  }
  const conversation = await tx.conversation.create({ data: { type: message.conversationType === 'dm' ? 'dm' : 'group', name: message.conversationType === 'entity_channel' ? 'CEO · Kênh công ty' : null } });
  await tx.convMember.createMany({ data: memberIds.map((userId) => ({ convId: conversation.id, userId })), skipDuplicates: true });
  return tx.ceoEntityConversationLink.create({ data: {
    portalConversationId: message.portalConversationId, targetEntityId: message.targetEntityId,
    localConversationId: conversation.id, participantUserId: message.recipientUserId, type: message.conversationType,
  } });
}

export async function executeCeoEntityMessage(db, user, input, now = new Date(), { entityId, messagingEnabled = false, localDirectorEmail = process.env.CEO_LOCAL_DIRECTOR_EMAIL } = {}) {
  requireDirector(user);
  if (!messagingEnabled) throw new CeoMessagingError('Messaging capability is disabled.', 422, 'ceo_messaging_capability_unavailable');
  const message = normalizeCeoMessageEnvelope(input);
  if (message.targetEntityId !== entityId) throw new CeoMessagingError('Message audience does not match this entity.', 403, 'ceo_messaging_audience_mismatch');
  const existing = await replay(db, message);
  if (existing) return { ...receiptEnvelope(existing, true), action: existing, idempotent: true, resource: 'messages' };
  let committed;
  try {
    committed = await db.$transaction(async (tx) => {
      const raced = await replay(tx, message);
      if (raced) return { receipt: raced, replayed: true };
      const localDirector = await resolveLocalDirector(tx, localDirectorEmail);
      const recipients = await resolveAudience(tx, message, localDirector);
      const link = await ensureLocalConversation(tx, message, localDirector, recipients);
      const localMessage = await tx.message.create({ data: { convId: link.localConversationId, senderId: localDirector.id, content: message.content, createdAt: now } });
      const receipt = await tx.ceoEntityMessageReceipt.create({ data: {
        idempotencyKey: message.idempotencyKey, correlationId: message.correlationId, actorSubject: message.actorSubject,
        targetEntityId: message.targetEntityId, portalConversationId: message.portalConversationId,
        localConversationId: link.localConversationId, localMessageId: localMessage.id, payloadHash: message.payloadHash, createdAt: now,
      } });
      const route = `/messages?conversation=${encodeURIComponent(link.localConversationId)}&from=ceo-inbox`;
      const notice = normalizeNotificationDraft(`Tin nhắn từ ${localDirector.name}`, route);
      await tx.notification.createMany({ data: recipients.map((recipient) => ({ userId: recipient.id, ...notice })) });
      await tx.realmChangeEvent.createMany({ data: recipients.map((recipient) => ({ resource: 'messages', action: 'create', actorId: localDirector.id, audienceUserId: recipient.id, domains: '["messages","notifications"]', createdAt: now })) });
      await tx.auditLog.create({ data: { userId: localDirector.id, userName: localDirector.name, action: 'ceo_message_delivered', entity: 'messages', refId: localMessage.id, detail: `receipt=${receipt.id}; correlation=${message.correlationId}; actorSubject=${message.actorSubject}; portalConversation=${message.portalConversationId}; recipients=${recipients.length}` } });
      return { receipt, replayed: false };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await replay(db, message);
    if (!raced) throw error;
    committed = { receipt: raced, replayed: true };
  }
  return { ...receiptEnvelope(committed.receipt, committed.replayed), action: committed.receipt, idempotent: committed.replayed, resource: 'messages' };
}

export async function findCeoEntityMessageReceipt(db, user, { correlationId, entityId }) {
  requireDirector(user);
  const receipt = await db.ceoEntityMessageReceipt.findUnique({ where: { correlationId: String(correlationId || '') } });
  if (!receipt || receipt.targetEntityId !== entityId) throw new CeoMessagingError('Message receipt was not found.', 404, 'ceo_messaging_receipt_not_found');
  return receiptEnvelope(receipt, true);
}

export async function buildCeoEntityMessageFeed(db, user, { portalConversationId, entityId, after = null }) {
  requireDirector(user);
  const link = await db.ceoEntityConversationLink.findUnique({ where: { portalConversationId } });
  if (!link || link.targetEntityId !== entityId) throw new CeoMessagingError('Conversation feed was not found.', 404, 'ceo_messaging_feed_not_found');
  const afterDate = after ? new Date(after) : null;
  if (afterDate && Number.isNaN(afterDate.getTime())) throw new CeoMessagingError('Feed cursor is invalid.', 400, 'ceo_messaging_cursor_invalid');
  const [messages, members, users] = await Promise.all([
    db.message.findMany({ where: { convId: link.localConversationId, ...(afterDate ? { createdAt: { gt: afterDate } } : {}) }, orderBy: { createdAt: 'asc' }, take: 200 }),
    db.convMember.findMany({ where: { convId: link.localConversationId } }),
    db.user.findMany({ select: { id: true, name: true, role: true, roles: true } }),
  ]);
  const names = new Map(users.map((row) => [row.id, row.name]));
  const directorIds = new Set(users.filter((row) => isDirector(row)).map((row) => row.id));
  const recipientMembers = members.filter((member) => !directorIds.has(member.userId) && (!link.participantUserId || member.userId === link.participantUserId));
  return {
    contract: CEO_MESSAGE_FEED_CONTRACT, version: CEO_MESSAGING_VERSION, entityId,
    portalConversationId, asOf: new Date().toISOString(),
    messages: messages.map((message) => ({
      id: message.id, senderRef: message.senderId, senderName: names.get(message.senderId) || 'Employee',
      content: message.content, sentAt: message.createdAt,
      readByRecipient: directorIds.has(message.senderId) && recipientMembers.length > 0 && recipientMembers.every((member) => new Date(member.lastReadAt) >= new Date(message.createdAt)),
    })),
  };
}

export function assertCeoMessageHeaders(request, message) {
  if (request.headers.get('idempotency-key') !== message.idempotencyKey || request.headers.get('x-correlation-id') !== message.correlationId
    || request.headers.get('x-ceo-actor-subject') !== message.actorSubject || request.headers.get('x-ceo-message-scope') !== message.scope) {
    throw new CeoMessagingError('Message headers do not match the envelope.', 400, 'ceo_messaging_header_mismatch');
  }
}

export function ceoMessageRepositoryExecutor(context) {
  return (db, user, input, now) => executeCeoEntityMessage(db, user, input, now, context);
}
