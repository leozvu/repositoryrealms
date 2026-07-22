import { isDirector } from './perm.js';
import { hashCeoIdentitySecret, normalizeCeoScopes, requireCeoStepUp } from './ceo-identity.js';
import { requireCeoPortalSession } from './ceo-identity-admin.js';
import { parseCeoRegistryCapabilities, sanitizeCeoSyncErrorCode } from './ceo-entity-registry.js';
import {
  prepareCeoRegistrySync,
  recordCeoRegistrySyncFailure,
  recordCeoRegistrySyncSuccess,
} from './ceo-entity-registry-admin.js';
import { assertCeoRolloutCapability } from './ceo-rollout.js';
import { assertCeoDashboardUpstreamOrigin } from './ceo-unified-dashboard.js';
import {
  CEO_COMMAND_CONTRACT,
  CEO_COMMAND_FETCH_TIMEOUT_MS,
  CEO_COMMAND_GATEWAY_VERSION,
  CeoCommandError,
  ceoCommandDefinition,
  ceoCommandRecordHref,
  normalizeCeoCommandEnvelope,
  normalizeCeoCommandPayload,
  sanitizeCeoCommandReceipt,
} from './ceo-command-gateway.js';

const resolveServerSecret = (name) => process.env[name];
const resolveAllowedOrigins = (entity) => {
  const suffix = String(entity.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return String(process.env[`CEO_ENTITY_${suffix}_ALLOWED_ORIGINS`] || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
};

function requireDirector(user) {
  if (!user) throw new CeoCommandError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoCommandError('Director scope required.', 403, 'ceo_command_director_required');
}

function safeErrorCode(error, fallback = 'ceo_command_target_unavailable') {
  if (error?.name === 'AbortError') return 'ceo_command_target_timeout';
  return sanitizeCeoSyncErrorCode(error?.code || fallback);
}

function serializeDelivery(row) {
  const entity = row.entity || null;
  return {
    id: row.id,
    targetEntityId: row.entityId,
    targetDisplayName: entity?.displayName || row.entityId,
    action: row.command,
    scope: row.scope,
    correlationId: row.correlationId,
    status: row.status,
    attemptCount: row.attemptCount,
    receipt: row.targetReceiptId ? {
      id: row.targetReceiptId,
      resource: row.targetResource,
      recordId: row.targetRecordId || null,
      committedAt: row.targetReceiptAt,
      href: ceoCommandRecordHref(row.targetResource, row.targetRecordId),
    } : null,
    lastErrorCode: row.lastErrorCode || null,
    lastAttemptAt: row.lastAttemptAt || null,
    confirmedAt: row.confirmedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireCommandSession(db, user, rawToken, { now, hashSecret, touch = true } = {}) {
  requireDirector(user);
  const session = await requireCeoPortalSession(db, user, rawToken, { now, hashSecret, touch });
  requireCeoStepUp(session, now);
  return session;
}

async function requireTarget(db, session, targetEntityId, definition) {
  const [entity, membership] = await Promise.all([
    db.ceoEntityRegistry.findUnique({ where: { id: targetEntityId } }),
    db.ceoEntityMembership.findUnique({ where: { identityId_entityId: { identityId: session.identityId, entityId: targetEntityId } } }),
  ]);
  if (!entity || !entity.enabled) throw new CeoCommandError('Target entity is not enabled.', 403, 'ceo_command_entity_disabled');
  if (!membership || membership.status !== 'active' || membership.localRole !== 'DIRECTOR') {
    throw new CeoCommandError('Active Director membership is required.', 403, 'ceo_command_membership_required');
  }
  const scopes = normalizeCeoScopes(membership.scopes);
  if (!scopes.includes(definition.scope)) {
    throw new CeoCommandError('Membership does not grant this command scope.', 403, 'ceo_command_scope_required');
  }
  if (!parseCeoRegistryCapabilities(entity.capabilities).includes(definition.capability)) {
    throw new CeoCommandError('Target entity does not advertise the required capability.', 422, 'ceo_command_capability_unavailable');
  }
  return { entity, membership };
}

async function readBoundedJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > 64 * 1024) {
    throw new CeoCommandError('Target response is too large.', 502, 'ceo_command_target_response_too_large');
  }
  try { return JSON.parse(text); } catch {
    throw new CeoCommandError('Target returned invalid JSON.', 502, 'ceo_command_target_json_invalid');
  }
}

async function updateDelivery(db, user, id, data, auditAction) {
  return db.$transaction(async (tx) => {
    const updated = await tx.ceoCommandDelivery.update({ where: { id }, data });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: auditAction,
        entity: 'ceo_command_delivery',
        refId: id,
        detail: `target=${updated.entityId}; command=${updated.command}; correlation=${updated.correlationId}; status=${updated.status}; receipt=${updated.targetReceiptId || 'none'}`,
      },
    });
    return updated;
  });
}

function ensureReplayMatches(existing, command, identityId, idempotencyKeyHash) {
  if (
    existing.identityId !== identityId || existing.entityId !== command.targetEntityId
    || existing.command !== command.action || existing.scope !== command.scope
    || existing.correlationId !== command.correlationId || existing.payloadHash !== command.payloadHash
    || existing.idempotencyKeyHash !== idempotencyKeyHash
  ) {
    throw new CeoCommandError('Idempotency key or correlation ID belongs to another command.', 409, 'ceo_command_delivery_conflict');
  }
}

async function prepareDelivery(db, user, session, command, idempotencyKeyHash, now) {
  const [byKey, byCorrelation] = await Promise.all([
    db.ceoCommandDelivery.findUnique({ where: { idempotencyKeyHash }, include: { entity: true } }),
    db.ceoCommandDelivery.findUnique({ where: { correlationId: command.correlationId }, include: { entity: true } }),
  ]);
  const existing = byKey || byCorrelation;
  if (existing) {
    ensureReplayMatches(existing, command, session.identityId, idempotencyKeyHash);
    return { delivery: existing, replayed: true };
  }
  const delivery = await db.$transaction(async (tx) => {
    const row = await tx.ceoCommandDelivery.create({
      data: {
        identityId: session.identityId,
        entityId: command.targetEntityId,
        idempotencyKeyHash,
        correlationId: command.correlationId,
        command: command.action,
        scope: command.scope,
        payloadHash: command.payloadHash,
        status: 'dispatching',
        attemptCount: 1,
        lastAttemptAt: now,
        createdAt: now,
      },
      include: { entity: true },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id, userName: user.name, action: 'ceo_command_dispatch_started',
        entity: 'ceo_command_delivery', refId: row.id,
        detail: `target=${row.entityId}; command=${row.command}; correlation=${row.correlationId}; scope=${row.scope}`,
      },
    });
    return row;
  }, { isolationLevel: 'Serializable' });
  return { delivery, replayed: false };
}

function wireCommand(command) {
  return {
    contract: CEO_COMMAND_CONTRACT,
    version: CEO_COMMAND_GATEWAY_VERSION,
    targetEntityId: command.targetEntityId,
    actorSubject: command.actorSubject,
    action: command.action,
    scope: command.scope,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    payload: command.payload,
  };
}

export async function listCeoCommandDeliveries(db, user, rawToken, { entityId = null, limit = 50 } = {}, context = {}) {
  const now = context.now || new Date();
  const session = await requireCommandSession(db, user, rawToken, { ...context, now });
  const take = Math.max(1, Math.min(Number(limit) || 50, 100));
  const where = { identityId: session.identityId };
  if (entityId) where.entityId = String(entityId).trim().toLowerCase();
  const rows = await db.ceoCommandDelivery.findMany({
    where,
    include: { entity: true },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return { version: CEO_COMMAND_GATEWAY_VERSION, deliveries: rows.map(serializeDelivery) };
}

export async function dispatchCeoCommand(db, user, rawToken, input = {}, context = {}) {
  const now = context.now || new Date();
  const hashSecret = context.hashSecret;
  const session = await requireCommandSession(db, user, rawToken, { ...context, now });
  const action = String(input.action || '').trim();
  const definition = ceoCommandDefinition(action);
  if (!definition) throw new CeoCommandError('Command is not allowlisted.', 400, 'ceo_command_unsupported');
  const payload = normalizeCeoCommandPayload(action, input.payload);
  const command = normalizeCeoCommandEnvelope({
    contract: CEO_COMMAND_CONTRACT,
    version: CEO_COMMAND_GATEWAY_VERSION,
    targetEntityId: input.targetEntityId,
    actorSubject: session.identity.subject,
    action,
    scope: definition.scope,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    payload,
  });
  const { entity } = await requireTarget(db, session, command.targetEntityId, definition);
  try {
    await assertCeoRolloutCapability(db, entity.id, 'command.dispatch', { action: command.action, now });
  } catch (error) {
    throw new CeoCommandError(error.message, error.status || 423, error.code || 'ceo_rollout_capability_hold');
  }
  const idempotencyKeyHash = hashCeoIdentitySecret(command.idempotencyKey, hashSecret);
  let preparedDelivery;
  try {
    preparedDelivery = await prepareDelivery(db, user, session, command, idempotencyKeyHash, now);
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const existing = await db.ceoCommandDelivery.findUnique({ where: { idempotencyKeyHash }, include: { entity: true } })
      || await db.ceoCommandDelivery.findUnique({ where: { correlationId: command.correlationId }, include: { entity: true } });
    if (!existing) throw error;
    ensureReplayMatches(existing, command, session.identityId, idempotencyKeyHash);
    preparedDelivery = { delivery: existing, replayed: true };
  }
  if (preparedDelivery.replayed) return { replayed: true, delivery: serializeDelivery(preparedDelivery.delivery) };

  const allowedOriginResolver = context.allowedOriginResolver || resolveAllowedOrigins;
  const secretResolver = context.secretResolver || resolveServerSecret;
  const fetchImpl = context.fetchImpl || fetch;
  const timeoutMs = context.timeoutMs || CEO_COMMAND_FETCH_TIMEOUT_MS;
  let prepared;
  let requestStarted = false;
  try {
    const origin = assertCeoDashboardUpstreamOrigin(entity, allowedOriginResolver(entity));
    prepared = await prepareCeoRegistrySync(db, entity.id, { now, secretResolver });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      requestStarted = true;
      response = await fetchImpl(new URL('/api/ceo/v1/commands', origin), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${prepared.credential}`,
          'Idempotency-Key': command.idempotencyKey,
          'X-Correlation-ID': command.correlationId,
          'X-CEO-Actor-Subject': command.actorSubject,
          'X-CEO-Command-Scope': command.scope,
          'X-CEO-Entity-ID': entity.id,
          'User-Agent': 'RepositoryRealms-CEO-Portal/1.0',
        },
        body: JSON.stringify(wireCommand(command)),
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const responseBody = await readBoundedJson(response);
    if (!response.ok) {
      await recordCeoRegistrySyncSuccess(db, entity.id, now).catch(() => {});
      if (response.status >= 400 && response.status < 500) {
        const rejected = await updateDelivery(db, user, preparedDelivery.delivery.id, {
          status: 'rejected',
          lastErrorCode: sanitizeCeoSyncErrorCode(responseBody?.code || `ceo_command_target_http_${response.status}`),
        }, 'ceo_command_rejected');
        return { replayed: false, delivery: serializeDelivery({ ...rejected, entity }) };
      }
      throw new CeoCommandError('Target did not confirm the command.', 502, `ceo_command_target_http_${response.status}`);
    }
    const canonical = sanitizeCeoCommandReceipt(responseBody, command);
    await recordCeoRegistrySyncSuccess(db, entity.id, now).catch(() => {});
    const delivered = await updateDelivery(db, user, preparedDelivery.delivery.id, {
      status: 'delivered',
      targetReceiptId: canonical.receipt.id,
      targetResource: canonical.receipt.resource,
      targetRecordId: canonical.receipt.recordId,
      targetReceiptAt: new Date(canonical.receipt.committedAt),
      confirmedAt: now,
      lastErrorCode: null,
    }, 'ceo_command_delivered');
    return { replayed: false, delivery: serializeDelivery({ ...delivered, entity }) };
  } catch (error) {
    const code = safeErrorCode(error);
    await recordCeoRegistrySyncFailure(db, entity.id, code, now).catch(() => {});
    const pending = await updateDelivery(db, user, preparedDelivery.delivery.id, {
      status: requestStarted ? 'pending_confirmation' : 'failed',
      lastErrorCode: code,
    }, requestStarted ? 'ceo_command_confirmation_pending' : 'ceo_command_dispatch_failed');
    return { replayed: false, delivery: serializeDelivery({ ...pending, entity }) };
  }
}

export async function reconcileCeoCommand(db, user, rawToken, deliveryId, context = {}) {
  const now = context.now || new Date();
  const session = await requireCommandSession(db, user, rawToken, { ...context, now });
  const delivery = await db.ceoCommandDelivery.findFirst({
    where: { id: String(deliveryId || ''), identityId: session.identityId },
    include: { entity: true },
  });
  if (!delivery) throw new CeoCommandError('Delivery was not found.', 404, 'ceo_command_delivery_not_found');
  if (delivery.status === 'delivered' || delivery.status === 'rejected') return { delivery: serializeDelivery(delivery), terminal: true };
  const definition = ceoCommandDefinition(delivery.command);
  const { entity } = await requireTarget(db, session, delivery.entityId, definition);
  const controller = new AbortController();
  let timer;
  try {
    const origin = assertCeoDashboardUpstreamOrigin(entity, (context.allowedOriginResolver || resolveAllowedOrigins)(entity));
    const prepared = await prepareCeoRegistrySync(db, entity.id, { now, secretResolver: context.secretResolver || resolveServerSecret });
    timer = setTimeout(() => controller.abort(), context.timeoutMs || CEO_COMMAND_FETCH_TIMEOUT_MS);
    const url = new URL('/api/ceo/v1/commands/receipts', origin);
    url.searchParams.set('correlationId', delivery.correlationId);
    const response = await (context.fetchImpl || fetch)(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${prepared.credential}`, 'User-Agent': 'RepositoryRealms-CEO-Portal/1.0', 'X-CEO-Entity-ID': entity.id },
      cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    const body = await readBoundedJson(response);
    if (response.status === 404) {
      const pending = await updateDelivery(db, user, delivery.id, {
        status: 'pending_confirmation', lastErrorCode: 'ceo_command_receipt_not_found',
        attemptCount: { increment: 1 }, lastAttemptAt: now,
      }, 'ceo_command_reconcile_pending');
      return { delivery: serializeDelivery({ ...pending, entity }), terminal: false };
    }
    if (!response.ok) throw new CeoCommandError('Target receipt lookup failed.', 502, `ceo_command_receipt_http_${response.status}`);
    const canonical = sanitizeCeoCommandReceipt(body, {
      targetEntityId: delivery.entityId,
      actorSubject: session.identity.subject,
      action: delivery.command,
      correlationId: delivery.correlationId,
    });
    await recordCeoRegistrySyncSuccess(db, entity.id, now).catch(() => {});
    const confirmed = await updateDelivery(db, user, delivery.id, {
      status: 'delivered',
      targetReceiptId: canonical.receipt.id,
      targetResource: canonical.receipt.resource,
      targetRecordId: canonical.receipt.recordId,
      targetReceiptAt: new Date(canonical.receipt.committedAt),
      confirmedAt: now,
      lastErrorCode: null,
      attemptCount: { increment: 1 },
      lastAttemptAt: now,
    }, 'ceo_command_reconciled');
    return { delivery: serializeDelivery({ ...confirmed, entity }), terminal: true };
  } catch (error) {
    const code = safeErrorCode(error, 'ceo_command_reconcile_unavailable');
    await recordCeoRegistrySyncFailure(db, entity.id, code, now).catch(() => {});
    const pending = await updateDelivery(db, user, delivery.id, {
      status: 'pending_confirmation', lastErrorCode: code,
      attemptCount: { increment: 1 }, lastAttemptAt: now,
    }, 'ceo_command_reconcile_pending');
    return { delivery: serializeDelivery({ ...pending, entity }), terminal: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function buildCeoCommandDraft({ targetEntityId, actorSubject, action, idempotencyKey, correlationId, payload }) {
  const definition = ceoCommandDefinition(action);
  if (!definition) throw new CeoCommandError('Command is not allowlisted.', 400, 'ceo_command_unsupported');
  const normalizedPayload = normalizeCeoCommandPayload(action, payload);
  return normalizeCeoCommandEnvelope({
    contract: CEO_COMMAND_CONTRACT, version: CEO_COMMAND_GATEWAY_VERSION,
    targetEntityId, actorSubject, action, scope: definition.scope,
    idempotencyKey, correlationId, payload: normalizedPayload,
  });
}
