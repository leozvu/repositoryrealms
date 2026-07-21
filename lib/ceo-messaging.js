import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const CEO_MESSAGING_VERSION = 1;
export const CEO_DIRECTORY_CONTRACT = 'repositoryrealms.ceo.directory';
export const CEO_MESSAGE_CONTRACT = 'repositoryrealms.ceo.message';
export const CEO_MESSAGE_RECEIPT_CONTRACT = 'repositoryrealms.ceo.message-receipt';
export const CEO_MESSAGE_FEED_CONTRACT = 'repositoryrealms.ceo.message-feed';
export const CEO_MESSAGING_FETCH_TIMEOUT_MS = 5_000;
export const CEO_MESSAGING_MAX_BODY_BYTES = 12 * 1024;
export const CEO_MESSAGING_SCOPES = Object.freeze(['directory.read', 'message.read', 'message.send', 'message.export']);
export const CEO_MESSAGING_POLICY = Object.freeze({
  version: '1.0.0', directoryCacheDays: 7, messageRetentionDays: 365,
  deletionGraceDays: 30, exportMaxMessages: 5_000,
});

const SAFE_ID = /^[a-zA-Z0-9:_-]{3,180}$/;
const ENTITY_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES = new Set(['dm', 'entity_channel']);

export class CeoMessagingError extends Error {
  constructor(message, status = 400, code = 'ceo_messaging_invalid') {
    super(message);
    this.name = 'CeoMessagingError';
    this.status = status;
    this.code = code;
  }
}

function fail(message, status, code) { throw new CeoMessagingError(message, status, code); }

function exactObject(value, allowed, field, status = 400) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be an object.`, status, 'ceo_messaging_payload_invalid');
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(`${field} contains unsupported fields.`, status, 'ceo_messaging_unknown_field');
}

function token(value, field, pattern = SAFE_ID, status = 400) {
  const normalized = String(value || '').trim();
  if (!pattern.test(normalized)) fail(`${field} is invalid.`, status, `ceo_messaging_${field}_invalid`);
  return normalized;
}

function text(value, field, min, max, { optional = false, multiline = false, status = 400 } = {}) {
  let normalized = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  normalized = multiline ? normalized.replace(/\r\n?/g, '\n').trim() : normalized.replace(/\s+/g, ' ').trim();
  if (optional && !normalized) return null;
  if (normalized.length < min || normalized.length > max) fail(`${field} is invalid.`, status, `ceo_messaging_${field}_invalid`);
  return normalized;
}

function email(value, field = 'email') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.length > 160 || !EMAIL.test(normalized)) fail(`${field} is invalid.`, 400, `ceo_messaging_${field}_invalid`);
  return normalized;
}

function iso(value, field, status = 502) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) fail(`${field} is invalid.`, status, 'ceo_messaging_timestamp_invalid');
  return date.toISOString();
}

export function ceoMessagingRetentionDate(now = new Date(), days = CEO_MESSAGING_POLICY.messageRetentionDays) {
  return new Date(new Date(now).getTime() + days * 86_400_000);
}

export function stableCeoMessagingJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCeoMessagingJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCeoMessagingJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function hashCeoMessagingPayload(value) {
  return createHash('sha256').update(stableCeoMessagingJson(value)).digest('hex');
}

function messagingKey(secret) {
  const value = String(secret || '');
  if (value.length < 32) fail('Messaging encryption secret is unavailable.', 503, 'ceo_messaging_encryption_unavailable');
  return createHash('sha256').update(value).digest();
}

export function encryptCeoMessage(content, secret) {
  const normalized = text(content, 'content', 1, 4_000, { multiline: true });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', messagingKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return {
    bodyCiphertext: ciphertext.toString('base64url'), bodyIv: iv.toString('base64url'),
    bodyTag: cipher.getAuthTag().toString('base64url'), contentHash: hashCeoMessagingPayload(normalized),
  };
}

export function decryptCeoMessage(row, secret) {
  if (row.deletedAt) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', messagingKey(secret), Buffer.from(row.bodyIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(row.bodyTag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(row.bodyCiphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    fail('Message content cannot be decrypted.', 503, 'ceo_messaging_decryption_failed');
  }
}

export function extractCeoMessageMentions(content) {
  const matches = String(content || '').match(/@[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map((value) => value.slice(1).toLowerCase()))].slice(0, 20);
}

export function normalizeCeoConversationDraft(input = {}) {
  exactObject(input, ['targetEntityId', 'type', 'remoteUserId', 'name'], 'conversation');
  const type = String(input.type || '').trim();
  if (!TYPES.has(type)) fail('Conversation type is invalid.', 400, 'ceo_messaging_conversation_type_invalid');
  const remoteUserId = type === 'dm' ? token(input.remoteUserId, 'remote_user') : null;
  return {
    targetEntityId: token(input.targetEntityId, 'target_entity', ENTITY_ID), type, remoteUserId,
    name: text(input.name, 'name', 1, 120),
  };
}

export function normalizeCeoMessageEnvelope(input = {}) {
  exactObject(input, ['contract', 'version', 'action', 'scope', 'targetEntityId', 'actorSubject', 'portalConversationId', 'conversationType', 'recipientUserId', 'idempotencyKey', 'correlationId', 'content', 'mentions'], 'message');
  if (input.contract !== CEO_MESSAGE_CONTRACT || Number(input.version) !== CEO_MESSAGING_VERSION) fail('Message contract is unsupported.', 409, 'ceo_messaging_contract_unsupported');
  if (input.action !== 'message.send' || input.scope !== 'message.send') fail('Message action or scope is invalid.', 403, 'ceo_messaging_scope_mismatch');
  const conversationType = String(input.conversationType || '').trim();
  if (!TYPES.has(conversationType)) fail('Conversation type is invalid.', 400, 'ceo_messaging_conversation_type_invalid');
  const content = text(input.content, 'content', 1, 4_000, { multiline: true });
  const recipientUserId = conversationType === 'dm' ? token(input.recipientUserId, 'recipient_user') : null;
  const suppliedMentions = Array.isArray(input.mentions) ? input.mentions.map((value) => email(value, 'mention')).slice(0, 20) : [];
  const mentions = [...new Set([...extractCeoMessageMentions(content), ...suppliedMentions])];
  const payload = { content, mentions, conversationType, recipientUserId };
  return {
    contract: CEO_MESSAGE_CONTRACT, version: CEO_MESSAGING_VERSION, action: 'message.send', scope: 'message.send',
    targetEntityId: token(input.targetEntityId, 'target_entity', ENTITY_ID),
    actorSubject: token(input.actorSubject, 'actor_subject'),
    portalConversationId: token(input.portalConversationId, 'portal_conversation'),
    conversationType, recipientUserId,
    idempotencyKey: token(input.idempotencyKey, 'idempotency_key'),
    correlationId: token(input.correlationId, 'correlation_id'),
    content, mentions, payloadHash: hashCeoMessagingPayload(payload),
  };
}

export function buildCeoDirectoryEnvelope({ entity, profiles, asOf = new Date() }) {
  return {
    contract: CEO_DIRECTORY_CONTRACT, version: CEO_MESSAGING_VERSION,
    entityId: token(entity.id, 'target_entity', ENTITY_ID), asOf: new Date(asOf).toISOString(),
    policyVersion: CEO_MESSAGING_POLICY.version,
    profiles: profiles.map((profile) => ({
      userId: token(profile.userId, 'remote_user'), email: email(profile.email),
      displayName: text(profile.displayName, 'display_name', 1, 120),
      title: text(profile.title, 'title', 0, 120, { optional: true }),
      sharePresence: profile.sharePresence === true, updatedAt: iso(profile.updatedAt, 'updated_at'),
    })),
  };
}

export function sanitizeCeoDirectoryEnvelope(value, expectedEntityId) {
  if (!value || value.contract !== CEO_DIRECTORY_CONTRACT || Number(value.version) !== CEO_MESSAGING_VERSION || value.entityId !== expectedEntityId) {
    fail('Directory contract is invalid.', 502, 'ceo_messaging_directory_invalid');
  }
  if (!Array.isArray(value.profiles) || value.profiles.length > 2_000) fail('Directory profile list is invalid.', 502, 'ceo_messaging_directory_invalid');
  return buildCeoDirectoryEnvelope({ entity: { id: expectedEntityId }, profiles: value.profiles, asOf: iso(value.asOf, 'as_of') });
}

export function sanitizeCeoMessageReceipt(value, expected = {}) {
  if (!value || value.contract !== CEO_MESSAGE_RECEIPT_CONTRACT || Number(value.version) !== CEO_MESSAGING_VERSION) fail('Message receipt is invalid.', 502, 'ceo_messaging_receipt_invalid');
  const receipt = value.receipt;
  exactObject(receipt, ['id', 'targetEntityId', 'actorSubject', 'portalConversationId', 'correlationId', 'localConversationId', 'localMessageId', 'committedAt', 'replayed'], 'receipt', 502);
  const clean = {
    id: token(receipt.id, 'receipt_id', SAFE_ID, 502), targetEntityId: token(receipt.targetEntityId, 'target_entity', ENTITY_ID, 502),
    actorSubject: token(receipt.actorSubject, 'actor_subject', SAFE_ID, 502), portalConversationId: token(receipt.portalConversationId, 'portal_conversation', SAFE_ID, 502),
    correlationId: token(receipt.correlationId, 'correlation_id', SAFE_ID, 502), localConversationId: token(receipt.localConversationId, 'local_conversation', SAFE_ID, 502),
    localMessageId: token(receipt.localMessageId, 'local_message', SAFE_ID, 502), committedAt: iso(receipt.committedAt, 'committed_at'), replayed: receipt.replayed === true,
  };
  const comparable = ['targetEntityId', 'actorSubject', 'portalConversationId', 'correlationId'];
  if (comparable.some((key) => expected[key] && clean[key] !== expected[key])) fail('Message receipt does not match delivery.', 502, 'ceo_messaging_receipt_mismatch');
  if (value.repository?.name !== 'RepositoryRealms' || value.repository?.receiptId !== clean.id
    || value.repository?.invariants?.authorization !== 'enforced' || value.repository?.invariants?.businessRules !== 'enforced'
    || value.repository?.invariants?.receipt !== 'verified' || value.repository?.invariants?.audit !== 'atomic') {
    fail('RepositoryRealms messaging evidence is missing.', 502, 'ceo_messaging_repository_evidence_missing');
  }
  return { receipt: clean, repository: value.repository };
}

export function sanitizeCeoMessageFeed(value, expected = {}) {
  if (!value || value.contract !== CEO_MESSAGE_FEED_CONTRACT || Number(value.version) !== CEO_MESSAGING_VERSION) fail('Message feed is invalid.', 502, 'ceo_messaging_feed_invalid');
  if (value.entityId !== expected.targetEntityId || value.portalConversationId !== expected.portalConversationId || !Array.isArray(value.messages) || value.messages.length > 200) fail('Message feed audience is invalid.', 502, 'ceo_messaging_feed_mismatch');
  return {
    entityId: value.entityId, portalConversationId: value.portalConversationId,
    messages: value.messages.map((message) => ({
      id: token(message.id, 'source_message', SAFE_ID, 502), senderRef: token(message.senderRef, 'sender_ref', SAFE_ID, 502),
      senderName: text(message.senderName, 'sender_name', 1, 120, { status: 502 }), content: text(message.content, 'content', 1, 4_000, { multiline: true, status: 502 }),
      sentAt: iso(message.sentAt, 'sent_at'), readByRecipient: message.readByRecipient === true,
    })),
  };
}
