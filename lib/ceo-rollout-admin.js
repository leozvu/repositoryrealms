import crypto from 'node:crypto';
import { isDirector } from './perm.js';
import { requireCeoStepUp } from './ceo-identity.js';
import { requireCeoPortalSession } from './ceo-identity-admin.js';
import {
  CEO_ROLLOUT_RING_DEFINITIONS,
  CEO_ROLLOUT_RING_ORDER,
  CEO_ROLLOUT_VERSION,
  CeoRolloutError,
  assertCeoProductionRolloutApproval,
  ceoRolloutConfirmation,
  ceoRolloutRingIndex,
  evaluateCeoRolloutEvidence,
  evidenceDigest,
  nextCeoRolloutRing,
  normalizeCeoRolloutEvidence,
  normalizeCeoRolloutTransition,
  readCeoRolloutApproval,
  requiredCeoRolloutEvidence,
  serializeCeoRolloutState,
} from './ceo-rollout.js';
import { normalizeCeoRegistryEntityId } from './ceo-entity-registry.js';

function requireDirector(user) {
  if (!user) throw new CeoRolloutError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoRolloutError('Director scope required.', 403, 'ceo_rollout_director_required');
}

function latestEvidence(rows, entityId, ring, now, transitionActorId) {
  return evaluateCeoRolloutEvidence(entityId, ring, rows, { now, transitionActorId });
}

function safeEvidence(row) {
  return {
    id: row.id,
    ring: row.ring,
    kind: row.kind,
    reference: row.reference,
    checksum: row.checksum,
    observedAt: row.observedAt,
    expiresAt: row.expiresAt,
    recordedByName: row.recordedByName,
    createdAt: row.createdAt,
  };
}

function safeReceipt(row) {
  return {
    id: row.id,
    action: row.action,
    fromRing: row.fromRing,
    toRing: row.toRing,
    decision: row.decision,
    reason: row.reason,
    evidenceDigest: row.evidenceDigest,
    approvalId: row.approvalId,
    correlationId: row.correlationId,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
  };
}

function approvalForContext(context, now) {
  return context.productionApproval || readCeoRolloutApproval(context.env || process.env, now);
}

export async function listCeoRollout(db, user, { now = new Date(), env = process.env } = {}) {
  requireDirector(user);
  const approval = readCeoRolloutApproval(env, now);
  const [entities, states, evidence, receipts] = await Promise.all([
    db.ceoEntityRegistry.findMany({ orderBy: { id: 'asc' } }),
    db.ceoRolloutState.findMany({ orderBy: { entityId: 'asc' } }),
    db.ceoRolloutEvidence.findMany({ where: { expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' }, take: 500 }),
    db.ceoRolloutReceipt.findMany({ orderBy: { createdAt: 'desc' }, take: 80 }),
  ]);
  const statesByEntity = new Map(states.map((state) => [state.entityId, state]));
  const evidenceByEntity = new Map(entities.map((entity) => [entity.id, evidence.filter((row) => row.entityId === entity.id)]));
  const receiptsByEntity = new Map(entities.map((entity) => [entity.id, receipts.filter((row) => row.entityId === entity.id).slice(0, 10)]));
  return {
    version: CEO_ROLLOUT_VERSION,
    policy: {
      order: CEO_ROLLOUT_RING_ORDER,
      rings: CEO_ROLLOUT_RING_DEFINITIONS,
      production: {
        decision: approval.decision,
        active: approval.active,
        approvalId: approval.id,
        maxRing: approval.maxRing,
        allowedEntities: approval.allowedEntities,
        expiresAt: approval.expiresAt,
        commandCanaryEntity: approval.commandCanaryEntity,
      },
      portalWritesEntityDatabases: false,
      migrationApplied: states.length === entities.length,
    },
    entities: entities.map((entity) => {
      const state = statesByEntity.get(entity.id);
      const currentRing = state?.currentRing || 'local_staging';
      const nextRing = nextCeoRolloutRing(currentRing);
      const rows = evidenceByEntity.get(entity.id) || [];
      return {
        id: entity.id,
        displayName: entity.displayName,
        environment: entity.environment,
        enabled: entity.enabled,
        state: state ? serializeCeoRolloutState(state) : { entityId: entity.id, currentRing, status: 'hold', recordVersion: 0, migrationRequired: true },
        nextRing,
        currentEvidence: { ...latestEvidence(rows, entity.id, currentRing, now, user.id), evidence: latestEvidence(rows, entity.id, currentRing, now, user.id).evidence.map(safeEvidence) },
        nextEvidence: nextRing ? { ...latestEvidence(rows, entity.id, nextRing, now, user.id), evidence: latestEvidence(rows, entity.id, nextRing, now, user.id).evidence.map(safeEvidence) } : null,
        receipts: (receiptsByEntity.get(entity.id) || []).map(safeReceipt),
        restrictions: entity.id === 'egolive' ? ['payout.local_only', 'settlement.local_only', 'finance_review.required_for_commands'] : [],
      };
    }),
  };
}

async function rolloutSession(db, user, rawToken, context, now) {
  requireDirector(user);
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now, touch: false });
  requireCeoStepUp(session, now);
  return session;
}

export async function recordCeoRolloutEvidence(db, user, rawToken, entityId, input = {}, context = {}) {
  const now = context.now || new Date();
  await rolloutSession(db, user, rawToken, context, now);
  entityId = normalizeCeoRegistryEntityId(entityId);
  const evidence = normalizeCeoRolloutEvidence(input, { now });
  return db.$transaction(async (tx) => {
    const state = await tx.ceoRolloutState.findUnique({ where: { entityId } });
    if (!state) throw new CeoRolloutError('Apply the CEO-9 migration before recording evidence.', 409, 'ceo_rollout_migration_required');
    const changed = await tx.ceoRolloutState.updateMany({
      where: { entityId, recordVersion: evidence.expectedVersion },
      data: { recordVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw new CeoRolloutError('Rollout state changed. Reload before retrying.', 409, 'ceo_rollout_version_conflict');
    const created = await tx.ceoRolloutEvidence.create({ data: {
      entityId,
      ring: evidence.ring,
      kind: evidence.kind,
      reference: evidence.reference,
      checksum: evidence.checksum,
      observedAt: evidence.observedAt,
      expiresAt: evidence.expiresAt,
      recordedById: user.id,
      recordedByName: user.name,
      createdAt: now,
    } });
    await tx.auditLog.create({ data: {
      userId: user.id,
      userName: user.name,
      action: 'ceo_rollout_evidence_recorded',
      entity: 'ceo_rollout_evidence',
      refId: created.id,
      detail: `target=${entityId}; ring=${evidence.ring}; kind=${evidence.kind}; checksum=${evidence.checksum.slice(0, 15)}…`,
    } });
    return { evidence: safeEvidence(created), recordVersion: state.recordVersion + 1 };
  }, { isolationLevel: 'Serializable' });
}

function transitionPlan(entity, state, command) {
  const currentIndex = ceoRolloutRingIndex(state.currentRing);
  if (command.action === 'pause') {
    if (command.targetRing) throw new CeoRolloutError('Pause does not accept a target ring.', 400, 'ceo_rollout_target_unexpected');
    return { fromRing: state.currentRing, toRing: state.currentRing, status: 'paused', evidenceRing: null };
  }
  if (command.action === 'activate') {
    const target = command.targetRing || state.currentRing;
    if (target !== state.currentRing) throw new CeoRolloutError('Activate must use the current ring.', 400, 'ceo_rollout_activation_ring_mismatch');
    return { fromRing: state.currentRing, toRing: target, status: 'active', evidenceRing: target };
  }
  if (command.action === 'promote') {
    const expected = nextCeoRolloutRing(state.currentRing);
    if (state.status !== 'active') throw new CeoRolloutError('Activate the current ring before promotion.', 409, 'ceo_rollout_current_ring_inactive');
    if (!expected || command.targetRing !== expected) throw new CeoRolloutError('Promotion must advance exactly one ring.', 409, 'ceo_rollout_promotion_order_invalid');
    return { fromRing: state.currentRing, toRing: expected, status: 'active', evidenceRing: expected };
  }
  const target = command.targetRing;
  if (!target || ceoRolloutRingIndex(target) >= currentIndex) throw new CeoRolloutError('Rollback must target an earlier ring.', 409, 'ceo_rollout_rollback_target_invalid');
  return { fromRing: state.currentRing, toRing: target, status: 'paused', evidenceRing: state.currentRing };
}

export async function transitionCeoRollout(db, user, rawToken, entityId, input = {}, context = {}) {
  const now = context.now || new Date();
  await rolloutSession(db, user, rawToken, context, now);
  const command = normalizeCeoRolloutTransition(input, entityId);
  const approval = approvalForContext(context, now);
  return db.$transaction(async (tx) => {
    const [entity, state] = await Promise.all([
      tx.ceoEntityRegistry.findUnique({ where: { id: command.entityId } }),
      tx.ceoRolloutState.findUnique({ where: { entityId: command.entityId } }),
    ]);
    if (!entity || !state) throw new CeoRolloutError('Rollout state is unavailable.', 404, 'ceo_rollout_state_not_found');
    if (state.recordVersion !== command.expectedVersion) throw new CeoRolloutError('Rollout state changed. Reload before retrying.', 409, 'ceo_rollout_version_conflict');
    const plan = transitionPlan(entity, state, command);
    const expectedConfirmation = ceoRolloutConfirmation(command.action, entity.id, plan.toRing);
    if (command.confirmation !== expectedConfirmation) throw new CeoRolloutError(`Type exactly ${expectedConfirmation}.`, 400, 'ceo_rollout_confirmation_invalid');
    if (!['pause', 'rollback'].includes(command.action)) assertCeoProductionRolloutApproval(entity, plan.toRing, approval, now);
    let evidence = [];
    if (plan.evidenceRing) {
      const rows = await tx.ceoRolloutEvidence.findMany({ where: { entityId: entity.id, ring: plan.evidenceRing, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } });
      const gate = evaluateCeoRolloutEvidence(entity.id, plan.evidenceRing, rows, { now, transitionActorId: user.id });
      if (gate.missing.length) throw new CeoRolloutError(`Missing evidence: ${gate.missing.join(', ')}.`, 422, 'ceo_rollout_evidence_incomplete');
      if (gate.notIndependent.length) throw new CeoRolloutError(`Independent reviewer required for: ${gate.notIndependent.join(', ')}.`, 422, 'ceo_rollout_independent_review_required');
      evidence = gate.evidence;
    }
    const correlationId = crypto.randomUUID();
    const receipt = await tx.ceoRolloutReceipt.create({ data: {
      entityId: entity.id,
      action: command.action,
      fromRing: plan.fromRing,
      toRing: plan.toRing,
      decision: 'approved',
      reason: command.reason,
      evidenceDigest: evidenceDigest(evidence),
      approvalId: approval?.id || null,
      correlationId,
      createdById: user.id,
      createdByName: user.name,
      createdAt: now,
    } });
    const changed = await tx.ceoRolloutState.updateMany({
      where: { entityId: entity.id, recordVersion: command.expectedVersion },
      data: {
        currentRing: plan.toRing,
        status: plan.status,
        recordVersion: { increment: 1 },
        lastTransitionAt: now,
        ...(command.action === 'rollback' ? { lastRollbackAt: now } : {}),
        ...(plan.evidenceRing && plan.evidenceRing !== 'local_staging' ? { lastReconciledAt: now } : {}),
        lastReceiptId: receipt.id,
      },
    });
    if (changed.count !== 1) throw new CeoRolloutError('Rollout state changed during transition.', 409, 'ceo_rollout_version_conflict');
    await tx.auditLog.create({ data: {
      userId: user.id,
      userName: user.name,
      action: `ceo_rollout_${command.action}`,
      entity: 'ceo_rollout_state',
      refId: entity.id,
      detail: `from=${plan.fromRing}; to=${plan.toRing}; status=${plan.status}; receipt=${receipt.id}; correlation=${correlationId}`,
    } });
    return {
      state: serializeCeoRolloutState({ ...state, currentRing: plan.toRing, status: plan.status, recordVersion: state.recordVersion + 1, lastTransitionAt: now, lastRollbackAt: command.action === 'rollback' ? now : state.lastRollbackAt, lastReconciledAt: plan.evidenceRing && plan.evidenceRing !== 'local_staging' ? now : state.lastReconciledAt }),
      receipt: safeReceipt(receipt),
      targetBusinessDatabaseTouched: false,
      deploymentTriggered: false,
    };
  }, { isolationLevel: 'Serializable' });
}

export function ceoRolloutRequiredEvidence(entityId, ring) {
  return requiredCeoRolloutEvidence(entityId, ring);
}
