import { isDirector } from './perm.js';
import { hashCeoIdentitySecret, normalizeCeoScopes, requireCeoStepUp } from './ceo-identity.js';
import { requireCeoPortalSession } from './ceo-identity-admin.js';
import { parseCeoRegistryCapabilities, sanitizeCeoSyncErrorCode } from './ceo-entity-registry.js';
import { prepareCeoRegistrySync, recordCeoRegistrySyncFailure, recordCeoRegistrySyncSuccess } from './ceo-entity-registry-admin.js';
import { assertCeoDashboardUpstreamOrigin } from './ceo-unified-dashboard.js';
import {
  CEO_MESSAGE_CONTRACT,
  CEO_MESSAGING_FETCH_TIMEOUT_MS,
  CEO_MESSAGING_POLICY,
  CEO_MESSAGING_VERSION,
  CeoMessagingError,
  ceoMessagingRetentionDate,
  decryptCeoMessage,
  encryptCeoMessage,
  extractCeoMessageMentions,
  normalizeCeoConversationDraft,
  normalizeCeoMessageEnvelope,
  sanitizeCeoDirectoryEnvelope,
  sanitizeCeoMessageFeed,
  sanitizeCeoMessageReceipt,
} from './ceo-messaging.js';

const resolveSecret = (name) => process.env[name];
const resolveAllowedOrigins = (entity) => {
  const suffix = String(entity.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return String(process.env[`CEO_ENTITY_${suffix}_ALLOWED_ORIGINS`] || '').split(',').map((value) => value.trim()).filter(Boolean);
};

function requireDirector(user) {
  if (!user) throw new CeoMessagingError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoMessagingError('Director scope required.', 403, 'ceo_messaging_director_required');
}

function encryptionSecret(context = {}) {
  return context.messageSecret || process.env.CEO_MESSAGING_ENCRYPTION_SECRET;
}

function safeErrorCode(error, fallback = 'ceo_messaging_target_unavailable') {
  if (error?.name === 'AbortError') return 'ceo_messaging_target_timeout';
  return sanitizeCeoSyncErrorCode(error?.code || fallback);
}

async function requireSession(db, user, rawToken, { scope, stepUp = false, ...context } = {}) {
  requireDirector(user);
  const now = context.now || new Date();
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now });
  if (stepUp) requireCeoStepUp(session, now);
  if (scope) {
    const memberships = await db.ceoEntityMembership.findMany({ where: { identityId: session.identityId, status: 'active' }, select: { scopes: true } });
    if (!memberships.some((membership) => normalizeCeoScopes(membership.scopes).includes(scope))) throw new CeoMessagingError('CEO membership does not grant messaging scope.', 403, 'ceo_messaging_scope_required');
  }
  return session;
}

async function requireTarget(db, session, entityId, scope) {
  const [entity, membership] = await Promise.all([
    db.ceoEntityRegistry.findUnique({ where: { id: entityId } }),
    db.ceoEntityMembership.findUnique({ where: { identityId_entityId: { identityId: session.identityId, entityId } } }),
  ]);
  if (!entity?.enabled) throw new CeoMessagingError('Target entity is not enabled.', 403, 'ceo_messaging_entity_disabled');
  if (!membership || membership.status !== 'active' || membership.localRole !== 'DIRECTOR' || !normalizeCeoScopes(membership.scopes).includes(scope)) {
    throw new CeoMessagingError('Active Director messaging membership is required.', 403, 'ceo_messaging_membership_required');
  }
  if (!parseCeoRegistryCapabilities(entity.capabilities).includes('people')) throw new CeoMessagingError('Target does not advertise people messaging.', 422, 'ceo_messaging_capability_unavailable');
  return entity;
}

async function readJson(response, maxBytes = 256 * 1024) {
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new CeoMessagingError('Target response is too large.', 502, 'ceo_messaging_target_response_too_large');
  try { return JSON.parse(raw); } catch { throw new CeoMessagingError('Target returned invalid JSON.', 502, 'ceo_messaging_target_json_invalid'); }
}

async function targetRequest(db, entity, path, init, context = {}) {
  const now = context.now || new Date();
  const origin = assertCeoDashboardUpstreamOrigin(entity, (context.allowedOriginResolver || resolveAllowedOrigins)(entity));
  const prepared = await prepareCeoRegistrySync(db, entity.id, { now, secretResolver: context.secretResolver || resolveSecret });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs || CEO_MESSAGING_FETCH_TIMEOUT_MS);
  try {
    const response = await (context.fetchImpl || fetch)(new URL(path, origin), {
      ...init, headers: { Accept: 'application/json', Authorization: `Bearer ${prepared.credential}`, 'User-Agent': 'RepositoryRealms-CEO-Portal/1.0', ...(init?.headers || {}) },
      cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    const body = await readJson(response);
    if (!response.ok) {
      const error = new CeoMessagingError(body?.error || 'Target messaging request failed.', response.status >= 500 ? 502 : response.status, sanitizeCeoSyncErrorCode(body?.code || `ceo_messaging_target_http_${response.status}`));
      error.targetStatus = response.status;
      throw error;
    }
    await recordCeoRegistrySyncSuccess(db, entity.id, now).catch(() => {});
    return body;
  } catch (error) {
    await recordCeoRegistrySyncFailure(db, entity.id, safeErrorCode(error), now).catch(() => {});
    throw error;
  } finally { clearTimeout(timer); }
}

function serializeProfile(row) {
  return { id: row.id, targetEntityId: row.entityId, targetDisplayName: row.entity?.displayName || row.entityId, remoteUserId: row.remoteUserId, email: row.email, displayName: row.displayName, title: row.title, sharePresence: row.sharePresence, sourceUpdatedAt: row.sourceUpdatedAt, fetchedAt: row.fetchedAt };
}

function serializeConversation(row, secret, { includeMessages = false } = {}) {
  const messages = (row.messages || []).map((message) => serializeMessage(message, secret));
  return {
    id: row.id, targetEntityId: row.entityId, targetDisplayName: row.entity?.displayName || row.entityId,
    type: row.type, remoteUserId: row.type === 'dm' ? row.remoteUserId : null, name: row.name,
    status: row.status, lastMessageAt: row.lastMessageAt, createdAt: row.createdAt,
    ...(includeMessages ? { messages } : { lastMessage: messages[0] || null }),
  };
}

function serializeMessage(row, secret) {
  return {
    id: row.id, direction: row.direction, senderName: row.senderName,
    content: row.deletedAt ? null : decryptCeoMessage(row, secret), mentions: JSON.parse(row.mentionRefs || '[]'),
    status: row.status, sentAt: row.sentAt, deliveredAt: row.deliveredAt, readAt: row.readAt,
    lastErrorCode: row.lastErrorCode, attemptCount: row.attemptCount, deletedAt: row.deletedAt,
  };
}

async function redactExpiredMessages(db, user, identityId, now) {
  const result = await db.ceoUnifiedMessage.updateMany({
    where: { deletedAt: null, retentionUntil: { lte: now }, conversation: { identityId, status: { not: 'incident_hold' } } },
    data: { bodyCiphertext: '', bodyIv: '', bodyTag: '', mentionRefs: '[]', status: 'deleted', deletedAt: now },
  });
  if (result.count) await db.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_message_retention_redaction', entity: 'ceo_unified_message', refId: identityId, detail: `redacted=${result.count}; policy=${CEO_MESSAGING_POLICY.version}` } });
}

export async function listCeoDirectory(db, user, rawToken, context = {}) {
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'directory.read' });
  const rows = await db.ceoDirectoryProfileCache.findMany({ where: { identityId: session.identityId, retentionUntil: { gt: context.now || new Date() } }, include: { entity: true }, orderBy: [{ entityId: 'asc' }, { displayName: 'asc' }], take: 2_000 });
  return { version: CEO_MESSAGING_VERSION, profiles: rows.map(serializeProfile) };
}

async function syncEntityDirectory(db, user, session, entity, context) {
  const now = context.now || new Date();
  const body = await targetRequest(db, entity, '/api/ceo/v1/directory', { method: 'GET' }, context);
  const directory = sanitizeCeoDirectoryEnvelope(body, entity.id);
  const remoteIds = directory.profiles.map((profile) => profile.userId);
  await db.$transaction(async (tx) => {
    for (const profile of directory.profiles) {
      await tx.ceoDirectoryProfileCache.upsert({
        where: { identityId_entityId_remoteUserId: { identityId: session.identityId, entityId: entity.id, remoteUserId: profile.userId } },
        create: { identityId: session.identityId, entityId: entity.id, remoteUserId: profile.userId, email: profile.email, displayName: profile.displayName, title: profile.title, sharePresence: profile.sharePresence, sourceUpdatedAt: new Date(profile.updatedAt), fetchedAt: now, retentionUntil: ceoMessagingRetentionDate(now, CEO_MESSAGING_POLICY.directoryCacheDays) },
        update: { email: profile.email, displayName: profile.displayName, title: profile.title, sharePresence: profile.sharePresence, sourceUpdatedAt: new Date(profile.updatedAt), fetchedAt: now, retentionUntil: ceoMessagingRetentionDate(now, CEO_MESSAGING_POLICY.directoryCacheDays) },
      });
    }
    await tx.ceoDirectoryProfileCache.deleteMany({ where: { identityId: session.identityId, entityId: entity.id, ...(remoteIds.length ? { remoteUserId: { notIn: remoteIds } } : {}) } });
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_directory_synced', entity: 'ceo_directory_cache', refId: entity.id, detail: `profiles=${remoteIds.length}; policy=${CEO_MESSAGING_POLICY.version}` } });
  });
  return remoteIds.length;
}

export async function syncCeoDirectory(db, user, rawToken, { entityId = null } = {}, context = {}) {
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'directory.read' });
  const memberships = await db.ceoEntityMembership.findMany({ where: { identityId: session.identityId, status: 'active' }, include: { entity: true } });
  const targets = memberships.filter((row) => row.entity.enabled && (!entityId || row.entityId === entityId) && normalizeCeoScopes(row.scopes).includes('directory.read'));
  if (entityId && !targets.length) throw new CeoMessagingError('Directory target is unavailable.', 403, 'ceo_messaging_entity_unavailable');
  const results = [];
  for (const membership of targets) {
    try { results.push({ entityId: membership.entityId, status: 'synced', profiles: await syncEntityDirectory(db, user, session, membership.entity, context) }); }
    catch (error) { results.push({ entityId: membership.entityId, status: 'degraded', code: safeErrorCode(error, 'ceo_messaging_directory_sync_failed') }); }
  }
  return { version: CEO_MESSAGING_VERSION, results, ...(await listCeoDirectory(db, user, rawToken, { ...context, touch: false })) };
}

export async function listCeoConversations(db, user, rawToken, context = {}) {
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'message.read' });
  await redactExpiredMessages(db, user, session.identityId, context.now || new Date());
  const rows = await db.ceoUnifiedConversation.findMany({ where: { identityId: session.identityId, status: { not: 'archived' } }, include: { entity: true, messages: { where: { deletedAt: null }, orderBy: { sentAt: 'desc' }, take: 1 } }, orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }], take: 200 });
  return { version: CEO_MESSAGING_VERSION, conversations: rows.map((row) => serializeConversation(row, encryptionSecret(context))) };
}

export async function createCeoConversation(db, user, rawToken, input, context = {}) {
  const now = context.now || new Date();
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'message.send', stepUp: true });
  const draft = normalizeCeoConversationDraft(input);
  await requireTarget(db, session, draft.targetEntityId, 'message.send');
  if (draft.type === 'dm') {
    const profile = await db.ceoDirectoryProfileCache.findUnique({ where: { identityId_entityId_remoteUserId: { identityId: session.identityId, entityId: draft.targetEntityId, remoteUserId: draft.remoteUserId } } });
    if (!profile || profile.retentionUntil <= now) throw new CeoMessagingError('Recipient is not in the current shared directory.', 422, 'ceo_messaging_recipient_unavailable');
  }
  const storedRemoteUserId = draft.type === 'entity_channel' ? `channel:${draft.targetEntityId}` : draft.remoteUserId;
  const existing = await db.ceoUnifiedConversation.findUnique({ where: { identityId_entityId_type_remoteUserId: { identityId: session.identityId, entityId: draft.targetEntityId, type: draft.type, remoteUserId: storedRemoteUserId } }, include: { entity: true, messages: { orderBy: { sentAt: 'desc' }, take: 1 } } });
  if (existing) return { conversation: serializeConversation(existing, encryptionSecret(context)), replayed: true };
  const row = await db.$transaction(async (tx) => {
    const created = await tx.ceoUnifiedConversation.create({ data: { identityId: session.identityId, entityId: draft.targetEntityId, type: draft.type, remoteUserId: storedRemoteUserId, name: draft.name, retentionUntil: ceoMessagingRetentionDate(now), createdAt: now }, include: { entity: true, messages: true } });
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_conversation_created', entity: 'ceo_unified_conversation', refId: created.id, detail: `target=${created.entityId}; type=${created.type}` } });
    return created;
  }, { isolationLevel: 'Serializable' });
  return { conversation: serializeConversation(row, encryptionSecret(context)), replayed: false };
}

export async function getCeoConversation(db, user, rawToken, conversationId, context = {}) {
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'message.read' });
  await redactExpiredMessages(db, user, session.identityId, context.now || new Date());
  const row = await db.ceoUnifiedConversation.findFirst({ where: { id: String(conversationId || ''), identityId: session.identityId }, include: { entity: true, messages: { orderBy: { sentAt: 'asc' }, take: 500 } } });
  if (!row) throw new CeoMessagingError('Conversation was not found.', 404, 'ceo_messaging_conversation_not_found');
  return { version: CEO_MESSAGING_VERSION, conversation: serializeConversation(row, encryptionSecret(context), { includeMessages: true }) };
}

export async function updateCeoConversationPolicy(db, user, rawToken, conversationId, input = {}, context = {}) {
  const now = context.now || new Date();
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'message.read', stepUp: true });
  const action = String(input.action || '');
  if (!['archive', 'restore', 'incident_hold', 'release_hold', 'request_deletion'].includes(action) || Object.keys(input).some((key) => key !== 'action')) throw new CeoMessagingError('Conversation policy action is invalid.', 400, 'ceo_messaging_policy_action_invalid');
  const row = await db.ceoUnifiedConversation.findFirst({ where: { id: String(conversationId || ''), identityId: session.identityId } });
  if (!row) throw new CeoMessagingError('Conversation was not found.', 404, 'ceo_messaging_conversation_not_found');
  const data = action === 'incident_hold' ? { status: 'incident_hold' }
    : action === 'request_deletion' ? { status: 'archived', retentionUntil: ceoMessagingRetentionDate(now, CEO_MESSAGING_POLICY.deletionGraceDays) }
      : action === 'archive' ? { status: 'archived' } : { status: 'active' };
  const updated = await db.$transaction(async (tx) => {
    const saved = await tx.ceoUnifiedConversation.update({ where: { id: row.id }, data });
    if (action === 'request_deletion') await tx.ceoUnifiedMessage.updateMany({ where: { conversationId: row.id, retentionUntil: { gt: saved.retentionUntil } }, data: { retentionUntil: saved.retentionUntil } });
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action: `ceo_conversation_${action}`, entity: 'ceo_unified_conversation', refId: row.id, detail: `target=${row.entityId}; policy=${CEO_MESSAGING_POLICY.version}; retentionUntil=${saved.retentionUntil.toISOString()}` } });
    return saved;
  });
  return { id: updated.id, status: updated.status, retentionUntil: updated.retentionUntil };
}

async function updateMessage(db, user, message, data, action) {
  return db.$transaction(async (tx) => {
    const updated = await tx.ceoUnifiedMessage.update({ where: { id: message.id }, data });
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action, entity: 'ceo_unified_message', refId: message.id, detail: `conversation=${message.conversationId}; correlation=${message.correlationId}; status=${updated.status}; receipt=${updated.targetReceiptId || 'none'}` } });
    return updated;
  });
}

function wireMessage(message) {
  return { contract: message.contract, version: message.version, action: message.action, scope: message.scope, targetEntityId: message.targetEntityId, actorSubject: message.actorSubject, portalConversationId: message.portalConversationId, conversationType: message.conversationType, recipientUserId: message.recipientUserId, idempotencyKey: message.idempotencyKey, correlationId: message.correlationId, content: message.content, mentions: message.mentions };
}

export async function sendCeoMessage(db, user, rawToken, conversationId, input = {}, context = {}) {
  const now = context.now || new Date();
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'message.send', stepUp: true });
  const conversation = await db.ceoUnifiedConversation.findFirst({ where: { id: String(conversationId || ''), identityId: session.identityId, status: 'active' }, include: { entity: true } });
  if (!conversation) throw new CeoMessagingError('Conversation was not found.', 404, 'ceo_messaging_conversation_not_found');
  const entity = await requireTarget(db, session, conversation.entityId, 'message.send');
  const envelope = normalizeCeoMessageEnvelope({ contract: CEO_MESSAGE_CONTRACT, version: CEO_MESSAGING_VERSION, action: 'message.send', scope: 'message.send', targetEntityId: conversation.entityId, actorSubject: session.identity.subject, portalConversationId: conversation.id, conversationType: conversation.type, recipientUserId: conversation.type === 'dm' ? conversation.remoteUserId : null, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, content: input.content, mentions: input.mentions || [] });
  const keyHash = hashCeoIdentitySecret(envelope.idempotencyKey, context.hashSecret);
  const [byKey, byCorrelation] = await Promise.all([
    db.ceoUnifiedMessage.findUnique({ where: { idempotencyKeyHash: keyHash } }),
    db.ceoUnifiedMessage.findUnique({ where: { correlationId: envelope.correlationId } }),
  ]);
  const existing = byKey || byCorrelation;
  if (existing) {
    if (existing.idempotencyKeyHash !== keyHash || existing.conversationId !== conversation.id || existing.correlationId !== envelope.correlationId || existing.contentHash !== envelope.payloadHash) throw new CeoMessagingError('Message idempotency conflict.', 409, 'ceo_messaging_idempotency_conflict');
    return { message: serializeMessage(existing, encryptionSecret(context)), replayed: true };
  }
  const encrypted = encryptCeoMessage(envelope.content, encryptionSecret(context));
  let prepared;
  try {
    prepared = await db.$transaction(async (tx) => {
      const row = await tx.ceoUnifiedMessage.create({ data: { conversationId: conversation.id, direction: 'outbound', senderRef: session.identity.subject, senderName: session.identity.displayName, ...encrypted, contentHash: envelope.payloadHash, mentionRefs: JSON.stringify(envelope.mentions), idempotencyKeyHash: keyHash, correlationId: envelope.correlationId, status: 'dispatching', sentAt: now, retentionUntil: ceoMessagingRetentionDate(now), createdAt: now } });
      await tx.ceoUnifiedConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now, retentionUntil: ceoMessagingRetentionDate(now) } });
      await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_message_dispatch_started', entity: 'ceo_unified_message', refId: row.id, detail: `target=${conversation.entityId}; conversation=${conversation.id}; correlation=${envelope.correlationId}` } });
      return row;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await db.ceoUnifiedMessage.findUnique({ where: { idempotencyKeyHash: keyHash } }) || await db.ceoUnifiedMessage.findUnique({ where: { correlationId: envelope.correlationId } });
    if (!raced || raced.idempotencyKeyHash !== keyHash || raced.conversationId !== conversation.id || raced.contentHash !== envelope.payloadHash) throw new CeoMessagingError('Message idempotency conflict.', 409, 'ceo_messaging_idempotency_conflict');
    return { message: serializeMessage(raced, encryptionSecret(context)), replayed: true };
  }
  let requestStarted = false;
  try {
    requestStarted = true;
    const body = await targetRequest(db, entity, '/api/ceo/v1/messaging/deliver', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': envelope.idempotencyKey, 'X-Correlation-ID': envelope.correlationId, 'X-CEO-Actor-Subject': envelope.actorSubject, 'X-CEO-Message-Scope': envelope.scope }, body: JSON.stringify(wireMessage(envelope)) }, context);
    const canonical = sanitizeCeoMessageReceipt(body, { targetEntityId: entity.id, actorSubject: session.identity.subject, portalConversationId: conversation.id, correlationId: envelope.correlationId });
    const delivered = await updateMessage(db, user, prepared, { status: 'delivered', targetReceiptId: canonical.receipt.id, targetConversationId: canonical.receipt.localConversationId, targetMessageId: canonical.receipt.localMessageId, deliveredAt: now, lastErrorCode: null }, 'ceo_message_delivered');
    return { message: serializeMessage(delivered, encryptionSecret(context)), replayed: false };
  } catch (error) {
    const status = error?.targetStatus && error.targetStatus < 500 ? 'failed' : requestStarted ? 'pending_confirmation' : 'failed';
    const pending = await updateMessage(db, user, prepared, { status, lastErrorCode: safeErrorCode(error), attemptCount: { increment: 1 } }, status === 'pending_confirmation' ? 'ceo_message_confirmation_pending' : 'ceo_message_failed');
    return { message: serializeMessage(pending, encryptionSecret(context)), replayed: false };
  }
}

export async function reconcileCeoMessage(db, user, rawToken, messageId, context = {}) {
  const now = context.now || new Date();
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'message.read', stepUp: true });
  const message = await db.ceoUnifiedMessage.findFirst({ where: { id: String(messageId || ''), direction: 'outbound', conversation: { identityId: session.identityId } }, include: { conversation: { include: { entity: true } } } });
  if (!message) throw new CeoMessagingError('Message was not found.', 404, 'ceo_messaging_message_not_found');
  if (['delivered', 'read'].includes(message.status)) return { message: serializeMessage(message, encryptionSecret(context)), terminal: true };
  const entity = await requireTarget(db, session, message.conversation.entityId, 'message.read');
  try {
    const body = await targetRequest(db, entity, `/api/ceo/v1/messaging/receipts?correlationId=${encodeURIComponent(message.correlationId)}`, { method: 'GET' }, context);
    const canonical = sanitizeCeoMessageReceipt(body, { targetEntityId: entity.id, actorSubject: session.identity.subject, portalConversationId: message.conversationId, correlationId: message.correlationId });
    const delivered = await updateMessage(db, user, message, { status: 'delivered', targetReceiptId: canonical.receipt.id, targetConversationId: canonical.receipt.localConversationId, targetMessageId: canonical.receipt.localMessageId, deliveredAt: now, lastErrorCode: null, attemptCount: { increment: 1 } }, 'ceo_message_reconciled');
    return { message: serializeMessage(delivered, encryptionSecret(context)), terminal: true };
  } catch (error) {
    const pending = await updateMessage(db, user, message, { status: 'pending_confirmation', lastErrorCode: safeErrorCode(error, 'ceo_messaging_receipt_unavailable'), attemptCount: { increment: 1 } }, 'ceo_message_reconcile_pending');
    return { message: serializeMessage(pending, encryptionSecret(context)), terminal: false };
  }
}

export async function refreshCeoConversation(db, user, rawToken, conversationId, context = {}) {
  const now = context.now || new Date();
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'message.read' });
  const conversation = await db.ceoUnifiedConversation.findFirst({ where: { id: String(conversationId || ''), identityId: session.identityId }, include: { entity: true, messages: { where: { targetMessageId: { not: null } }, select: { id: true, targetMessageId: true } } } });
  if (!conversation) throw new CeoMessagingError('Conversation was not found.', 404, 'ceo_messaging_conversation_not_found');
  const entity = await requireTarget(db, session, conversation.entityId, 'message.read');
  const body = await targetRequest(db, entity, `/api/ceo/v1/messaging/feed?conversationId=${encodeURIComponent(conversation.id)}`, { method: 'GET' }, context);
  const feed = sanitizeCeoMessageFeed(body, { targetEntityId: entity.id, portalConversationId: conversation.id });
  const outbound = new Map(conversation.messages.map((message) => [message.targetMessageId, message.id]));
  let imported = 0; let read = 0;
  await db.$transaction(async (tx) => {
    for (const item of feed.messages) {
      const outboundId = outbound.get(item.id);
      if (outboundId) {
        if (item.readByRecipient) { await tx.ceoUnifiedMessage.updateMany({ where: { id: outboundId, readAt: null }, data: { readAt: now, status: 'read' } }); read += 1; }
        continue;
      }
      const existing = await tx.ceoUnifiedMessage.findUnique({ where: { conversationId_sourceMessageId: { conversationId: conversation.id, sourceMessageId: item.id } } });
      if (existing) continue;
      const encrypted = encryptCeoMessage(item.content, encryptionSecret(context));
      await tx.ceoUnifiedMessage.create({ data: { conversationId: conversation.id, direction: 'inbound', senderRef: item.senderRef, senderName: item.senderName, ...encrypted, mentionRefs: JSON.stringify(extractCeoMessageMentions(item.content)), idempotencyKeyHash: hashCeoIdentitySecret(`inbound:${entity.id}:${item.id}`, context.hashSecret), correlationId: `inbound:${entity.id}:${item.id}`, sourceMessageId: item.id, status: 'delivered', sentAt: new Date(item.sentAt), deliveredAt: now, retentionUntil: ceoMessagingRetentionDate(now), createdAt: now } });
      imported += 1;
    }
    if (feed.messages.length) await tx.ceoUnifiedConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(feed.messages.at(-1).sentAt), retentionUntil: ceoMessagingRetentionDate(now) } });
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_conversation_refreshed', entity: 'ceo_unified_conversation', refId: conversation.id, detail: `target=${entity.id}; imported=${imported}; readReceipts=${read}` } });
  });
  return { imported, readReceipts: read, ...(await getCeoConversation(db, user, rawToken, conversation.id, { ...context, touch: false })) };
}

export async function exportCeoInbox(db, user, rawToken, context = {}) {
  const session = await requireSession(db, user, rawToken, { ...context, scope: 'message.export', stepUp: true });
  await redactExpiredMessages(db, user, session.identityId, context.now || new Date());
  const rows = await db.ceoUnifiedMessage.findMany({ where: { conversation: { identityId: session.identityId } }, include: { conversation: { include: { entity: true } } }, orderBy: { sentAt: 'asc' }, take: CEO_MESSAGING_POLICY.exportMaxMessages });
  await db.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_inbox_exported', entity: 'ceo_unified_message', refId: session.identityId, detail: `messages=${rows.length}; policy=${CEO_MESSAGING_POLICY.version}` } });
  return { contract: 'repositoryrealms.ceo.message-export', version: CEO_MESSAGING_VERSION, exportedAt: new Date().toISOString(), policyVersion: CEO_MESSAGING_POLICY.version, messages: rows.map((row) => ({ entityId: row.conversation.entityId, entityName: row.conversation.entity.displayName, conversationId: row.conversationId, conversationName: row.conversation.name, direction: row.direction, senderName: row.senderName, content: row.deletedAt ? null : decryptCeoMessage(row, encryptionSecret(context)), status: row.status, sentAt: row.sentAt, deletedAt: row.deletedAt })) };
}
