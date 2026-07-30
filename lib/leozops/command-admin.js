// Sprints 1E-1H — capability-bound dry runs and explicit confirmation.

import crypto from 'node:crypto';
import { isDirector } from '../perm.js';
import { realmLeadTransitions } from '../realm-action-contract.js';
import {
  LEOZOPS_COMMAND_CONFIRM_CONTRACT,
  LEOZOPS_COMMAND_CONTRACT,
  LEOZOPS_COMMAND_TTL_MS,
  LEOZOPS_COMMAND_VERSION,
  LEOZOPS_UNSUPPORTED_PROPOSAL_ACTIONS,
  LeozOpsCommandError,
  capabilityProjection,
  commandFactsHash,
  normalizeCommandConfirmation,
  normalizeCommandIdempotencyKey,
  normalizeCommandIntent,
  parseStoredJson,
  projectRuntime,
  sha256,
} from './command-contract.js';
import {
  LEOZOPS_PROPOSAL_CONTRACT,
  LEOZOPS_PROPOSAL_VERSION,
  normalizeLeadActionProposal,
  serializeLeadActionProposal,
} from './proposal-contract.js';
import { LEOZOPS_REVIEW_GOVERNANCE_MODE } from './review-contract.js';
import { assertLeozOpsExecutionAvailable } from './runtime-admin.js';

function fail(message, status, code) {
  throw new LeozOpsCommandError(message, status, code);
}

export function requireLeozOpsDirector(user) {
  if (!user?.id) fail('Authentication is required.', 401, 'leozops_command_unauthorized');
  if (!isDirector(user)) fail('Director scope is required.', 403, 'leozops_command_director_required');
}

function proposalRefs(proposal) {
  const refs = parseStoredJson(proposal?.leadRefs, null);
  if (!Array.isArray(refs) || refs.length > 25 || refs.some(ref => !/^[a-zA-Z0-9:_-]{1,160}$/.test(String(ref)))) {
    fail('Proposal references are invalid.', 409, 'leozops_command_proposal_invalid');
  }
  return [...new Set(refs.map(String))].sort();
}

function storedProposalInput(row) {
  return {
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: LEOZOPS_PROPOSAL_VERSION,
    brief_id: row.briefId,
    signal_id: row.signalId,
    action_type: row.actionType,
    reason_code: row.reasonCode,
    lead_refs: proposalRefs(row),
  };
}

function ensureCurrentProposal(proposal, review, currentBrief, targetRef, now) {
  if (!proposal || proposal.status !== 'proposed') fail('Proposal is unavailable.', 409, 'leozops_command_proposal_unavailable');
  if (!review || review.decision !== 'accept'
    || review.reasonCode !== 'reviewed_current_evidence'
    || review.governanceMode !== LEOZOPS_REVIEW_GOVERNANCE_MODE
    || review.proposalPayloadHash !== proposal.payloadHash) {
    fail('An accepted current review is required.', 409, 'leozops_command_review_required');
  }
  const expiresAt = new Date(proposal.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) fail('Proposal evidence has expired.', 409, 'leozops_command_proposal_expired');
  const refs = proposalRefs(proposal);
  if (!refs.includes(targetRef)) fail('Target is outside proposal evidence.', 409, 'leozops_command_target_mismatch');
  let normalized;
  try { normalized = normalizeLeadActionProposal(storedProposalInput(proposal), currentBrief); }
  catch { fail('Proposal no longer matches the current brief.', 409, 'leozops_command_proposal_stale'); }
  if (normalized.payloadHash !== proposal.payloadHash || normalized.evidenceHash !== proposal.evidenceHash) {
    fail('Proposal integrity check failed.', 409, 'leozops_command_proposal_stale');
  }
  return refs;
}

function confirmationToken(env, idempotencyHash, payloadHash) {
  const secret = String(env.LEOZOPS_CONFIRMATION_SECRET || '');
  if (secret.length < 32) fail('Command confirmation secret is not configured.', 503, 'leozops_command_confirmation_unavailable');
  return crypto.createHmac('sha256', secret).update(`${idempotencyHash}:${payloadHash}`).digest('base64url');
}

function leadProjection(lead) {
  return {
    external_id: String(lead.id),
    stage: String(lead.stage || 'new'),
    source: lead.source ? String(lead.source) : null,
    expected_close_at: lead.expectedClose ? String(lead.expectedClose) : null,
  };
}

function commandDraft(capability, lead, parameters, today) {
  const before = leadProjection(lead);
  if (capability.id === 'lead.followup.create') {
    if (parameters.date < today) fail('Follow-up date cannot be in the past.', 409, 'leozops_command_followup_date_past');
    return {
      repositoryInput: {
        action: capability.repositoryAction,
        entityId: String(lead.id),
        kind: parameters.kind,
        title: parameters.title,
        date: parameters.date,
      },
      preview: {
        operation: 'create', resource: 'activities', target_ref: String(lead.id),
        before: { scheduled_followup: false },
        after: { kind: parameters.kind, title: parameters.title, date: parameters.date, done: false },
        rollback_supported: false,
      },
    };
  }
  if (capability.id === 'lead.expected_close.update') {
    if (parameters.closeAt < today) fail('Expected-close date cannot be in the past.', 409, 'leozops_command_expected_close_past');
    if ((lead.expectedClose || null) === parameters.closeAt) fail('Expected-close date is already current.', 409, 'leozops_command_no_change');
    return {
      repositoryInput: {
        action: capability.repositoryAction,
        entityId: String(lead.id),
        expectedCloseAt: lead.expectedClose || null,
        closeAt: parameters.closeAt,
      },
      preview: {
        operation: 'update', resource: 'leads', target_ref: String(lead.id), field: 'expected_close_at',
        before: { expected_close_at: lead.expectedClose || null },
        after: { expected_close_at: parameters.closeAt },
        rollback_supported: true,
      },
    };
  }
  if (capability.id === 'lead.source.update') {
    const current = lead.source ? String(lead.source).trim().toLowerCase() : null;
    if (current === parameters.source) fail('Lead source is already current.', 409, 'leozops_command_no_change');
    return {
      repositoryInput: {
        action: capability.repositoryAction,
        entityId: String(lead.id),
        expectedSource: current,
        source: parameters.source,
      },
      preview: {
        operation: 'update', resource: 'leads', target_ref: String(lead.id), field: 'source',
        before: { source: current }, after: { source: parameters.source }, rollback_supported: true,
      },
    };
  }
  const current = String(lead.stage || 'new');
  if (!realmLeadTransitions(current).includes(parameters.nextStage)) {
    fail('Stage transition is outside the canonical transition graph.', 409, 'leozops_command_transition_invalid');
  }
  return {
    repositoryInput: {
      action: capability.repositoryAction,
      entityId: String(lead.id),
      expectedState: current,
      nextState: parameters.nextStage,
    },
    preview: {
      operation: 'update', resource: 'leads', target_ref: String(lead.id), field: 'stage',
      before: { stage: current }, after: { stage: parameters.nextStage }, rollback_supported: false,
    },
  };
}

function validStoredIntent(row) {
  const payload = parseStoredJson(row?.payload, null);
  const preview = parseStoredJson(row?.preview, null);
  return payload && preview
    && commandFactsHash(payload) === row.payloadHash
    && commandFactsHash(preview.before) === row.expectedStateHash
    ? { payload, preview }
    : null;
}

export function projectCommandIntent(row, { events = [], replayed = false, now = new Date() } = {}) {
  const stored = validStoredIntent(row);
  const expiresAt = new Date(row?.expiresAt);
  const expired = !Number.isNaN(expiresAt.getTime()) && expiresAt <= now && row?.status === 'prepared';
  const status = !stored ? 'invalid' : expired ? 'expired' : row.status;
  return {
    id: row?.id,
    proposal_id: row?.proposalId,
    capability: row?.capability,
    risk: row?.riskLevel,
    target_ref: row?.targetRef,
    status,
    work_version: row?.workVersion,
    preview: stored?.preview || null,
    created_at: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
    expires_at: row?.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    confirmed_at: row?.confirmedAt ? new Date(row.confirmedAt).toISOString() : null,
    repository_receipt_id: row?.repositoryReceiptId || null,
    last_error_code: row?.lastErrorCode || null,
    replayed,
    confirmation: {
      required: true,
      status: ['confirmed', 'executing', 'pending_reconciliation', 'succeeded', 'failed', 'dead_letter'].includes(status) ? 'recorded' : 'pending',
    },
    execution: {
      allowed: status === 'confirmed',
      status: status === 'succeeded' ? 'succeeded' : ['executing', 'pending_reconciliation'].includes(status) ? status : 'not_started',
      receipt_id: row?.repositoryReceiptId || null,
    },
    events: events.map(event => ({
      sequence: event.sequence,
      status: event.status,
      reason_code: event.reasonCode || null,
      receipt_id: event.receiptId || null,
      at: new Date(event.createdAt).toISOString(),
    })),
  };
}

function replayMatches(row, { proposal, review, user, normalized, payloadHash }) {
  if (row.proposalId !== proposal.id || row.reviewId !== review.id || row.preparedById !== user.id
    || row.capability !== normalized.capability.id || row.targetRef !== normalized.targetRef
    || row.payloadHash !== payloadHash) {
    fail('Idempotency key already belongs to a different command.', 409, 'leozops_command_idempotency_conflict');
  }
}

export async function prepareLeozOpsCommand(db, user, input, {
  currentBrief,
  idempotencyKey,
  correlationId,
  env = {},
  now = new Date(),
} = {}) {
  requireLeozOpsDirector(user);
  const normalized = normalizeCommandIntent(input);
  const idempotencyHash = sha256(normalizeCommandIdempotencyKey(idempotencyKey));
  if (env[normalized.capability.envFlag] !== 'true') fail('Capability is disabled.', 409, 'leozops_command_capability_disabled');
  const proposal = await db.leozOpsActionProposal.findUnique({ where: { id: normalized.proposalId } });
  if (!proposal) fail('Proposal was not found.', 404, 'leozops_command_proposal_not_found');
  const review = await db.leozOpsProposalReview.findUnique({ where: { proposalId: proposal.id } });
  ensureCurrentProposal(proposal, review, currentBrief, normalized.targetRef, now);
  if (!normalized.capability.proposalActionTypes.includes(proposal.actionType)) {
    fail(LEOZOPS_UNSUPPORTED_PROPOSAL_ACTIONS[proposal.actionType] || 'Capability does not match this proposal.', 409, 'leozops_command_capability_mismatch');
  }
  const lead = await db.lead.findUnique({
    where: { id: normalized.targetRef },
    select: { id: true, stage: true, source: true, expectedClose: true },
  });
  if (!lead) fail('Lead target was not found.', 404, 'leozops_command_target_not_found');
  const { repositoryInput, preview } = commandDraft(normalized.capability, lead, normalized.parameters, now.toISOString().slice(0, 10));
  const payloadHash = commandFactsHash(repositoryInput);
  const expectedStateHash = commandFactsHash(preview.before);
  const token = confirmationToken(env, idempotencyHash, payloadHash);
  const repositoryIdempotencyKey = `leozops:${idempotencyHash.slice(0, 48)}`;
  let replayed = false;
  let intent;
  try {
    intent = await db.$transaction(async tx => {
      const byKey = await tx.leozOpsCommandIntent.findUnique({ where: { idempotencyKeyHash: idempotencyHash } });
      const byCorrelation = await tx.leozOpsCommandIntent.findUnique({ where: { correlationId } });
      if (byCorrelation && byCorrelation.id !== byKey?.id) fail('Correlation ID belongs to another command.', 409, 'leozops_command_correlation_conflict');
      if (byKey) {
        replayMatches(byKey, { proposal, review, user, normalized, payloadHash });
        replayed = true;
        return byKey;
      }
      const created = await tx.leozOpsCommandIntent.create({ data: {
        proposalId: proposal.id,
        reviewId: review.id,
        idempotencyKeyHash: idempotencyHash,
        correlationId,
        capability: normalized.capability.id,
        riskLevel: normalized.capability.risk,
        targetRef: normalized.targetRef,
        payload: JSON.stringify(repositoryInput),
        payloadHash,
        expectedStateHash,
        preview: JSON.stringify(preview),
        confirmationTokenHash: sha256(token),
        repositoryIdempotencyKey,
        status: 'prepared',
        workVersion: 1,
        preparedById: user.id,
        expiresAt: new Date(now.getTime() + LEOZOPS_COMMAND_TTL_MS),
      } });
      await tx.leozOpsCommandEvent.create({ data: {
        intentId: created.id, sequence: 1, status: 'prepared', actorId: user.id, reasonCode: 'dry_run_verified', createdAt: now,
      } });
      await tx.auditLog.create({ data: {
        userId: user.id,
        userName: user.name || 'Director',
        action: 'leozops_command_prepare',
        entity: 'leozops_command_intent',
        refId: created.id,
        detail: `capability=${created.capability}; risk=${created.riskLevel}; target=${sha256(created.targetRef).slice(0, 12)}; execution=false`,
        at: now,
      } });
      return created;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const existing = await db.leozOpsCommandIntent.findUnique({ where: { idempotencyKeyHash: idempotencyHash } });
    if (!existing) throw error;
    replayMatches(existing, { proposal, review, user, normalized, payloadHash });
    intent = existing;
    replayed = true;
  }
  const events = await db.leozOpsCommandEvent.findMany({ where: { intentId: intent.id }, orderBy: { sequence: 'asc' } });
  return {
    contract: LEOZOPS_COMMAND_CONTRACT,
    version: LEOZOPS_COMMAND_VERSION,
    intent: projectCommandIntent(intent, { events, replayed, now }),
    confirmation_token: token,
  };
}

export async function confirmLeozOpsCommand(db, user, input, {
  env = {},
  now = new Date(),
} = {}) {
  requireLeozOpsDirector(user);
  const normalized = normalizeCommandConfirmation(input);
  const current = await db.leozOpsCommandIntent.findUnique({ where: { id: normalized.intentId } });
  if (!current) fail('Command intent was not found.', 404, 'leozops_command_intent_not_found');
  if (current.preparedById !== user.id) fail('Command belongs to another operator.', 403, 'leozops_command_operator_mismatch');
  const tokenHash = Buffer.from(sha256(normalized.token), 'hex');
  const storedHash = Buffer.from(String(current.confirmationTokenHash || ''), 'hex');
  if (tokenHash.length !== storedHash.length || !crypto.timingSafeEqual(tokenHash, storedHash)) {
    fail('Confirmation token is invalid.', 401, 'leozops_command_confirmation_invalid');
  }
  repositoryInputForIntent(current);
  if (['confirmed', 'executing', 'pending_reconciliation', 'succeeded'].includes(current.status)) {
    const events = await db.leozOpsCommandEvent.findMany({ where: { intentId: current.id }, orderBy: { sequence: 'asc' } });
    return {
      contract: LEOZOPS_COMMAND_CONFIRM_CONTRACT, version: LEOZOPS_COMMAND_VERSION,
      intent: projectCommandIntent(current, { events, replayed: true, now }), replayed: true,
    };
  }
  if (current.status !== 'prepared') fail('Command intent cannot be confirmed.', 409, 'leozops_command_state_conflict');
  if (new Date(current.expiresAt) <= now) fail('Command intent has expired.', 409, 'leozops_command_intent_expired');
  const capability = normalizeCommandIntent({
    contract: LEOZOPS_COMMAND_CONTRACT,
    version: LEOZOPS_COMMAND_VERSION,
    proposal_id: current.proposalId,
    capability: current.capability,
    target_ref: current.targetRef,
    parameters: (() => {
      const payload = parseStoredJson(current.payload, {});
      if (current.capability === 'lead.followup.create') return { kind: payload.kind, title: payload.title, date: payload.date };
      if (current.capability === 'lead.expected_close.update') return { close_at: payload.closeAt };
      if (current.capability === 'lead.source.update') return { source: payload.source };
      return { next_stage: payload.nextState };
    })(),
  }).capability;
  await assertLeozOpsExecutionAvailable(db, capability, { env, now });
  const intent = await db.$transaction(async tx => {
    const changed = await tx.leozOpsCommandIntent.updateMany({
      where: { id: current.id, status: 'prepared', workVersion: current.workVersion },
      data: {
        status: 'confirmed', confirmedById: user.id, confirmedAt: now,
        workVersion: { increment: 1 }, lastErrorCode: null,
      },
    });
    if (changed.count !== 1) fail('Command intent changed. Reload before retrying.', 409, 'leozops_command_state_conflict');
    await tx.leozOpsCommandEvent.create({ data: {
      intentId: current.id, sequence: current.workVersion + 1, status: 'confirmed', actorId: user.id,
      reasonCode: 'explicit_confirmation', createdAt: now,
    } });
    await tx.leozOpsCommandJob.create({ data: {
      intentId: current.id, kind: 'execute_reconcile', status: 'pending', runAt: now,
    } });
    await tx.auditLog.create({ data: {
      userId: user.id,
      userName: user.name || 'Director',
      action: 'leozops_command_confirm',
      entity: 'leozops_command_intent',
      refId: current.id,
      detail: `capability=${current.capability}; confirmation=explicit; queued=true`,
      at: now,
    } });
    return tx.leozOpsCommandIntent.findUnique({ where: { id: current.id } });
  }, { isolationLevel: 'Serializable' });
  const events = await db.leozOpsCommandEvent.findMany({ where: { intentId: intent.id }, orderBy: { sequence: 'asc' } });
  return {
    contract: LEOZOPS_COMMAND_CONFIRM_CONTRACT,
    version: LEOZOPS_COMMAND_VERSION,
    intent: projectCommandIntent(intent, { events, now }),
    replayed: false,
  };
}

export async function listLeozOpsCommands(db, user, {
  env = {},
  now = new Date(),
  limit = 50,
} = {}) {
  requireLeozOpsDirector(user);
  const take = Math.max(1, Math.min(Number(limit) || 50, 100));
  const [proposals, reviews, intents, runtime] = await Promise.all([
    db.leozOpsActionProposal.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    db.leozOpsProposalReview.findMany({ where: { decision: 'accept' }, orderBy: { reviewedAt: 'desc' }, take: 100 }),
    db.leozOpsCommandIntent.findMany({ orderBy: { createdAt: 'desc' }, take }),
    db.leozOpsRuntimeControl.findUnique({ where: { id: 'global' } }),
  ]);
  const reviewByProposal = new Map(reviews.map(review => [review.proposalId, review]));
  const accepted = proposals.filter(proposal => reviewByProposal.has(proposal.id)).map(proposal => {
    const review = reviewByProposal.get(proposal.id);
    const capabilities = (awaitedCapabilities(env)).filter(capability => capability.proposal_action_types.includes(proposal.actionType));
    return {
      ...serializeLeadActionProposal(proposal, { review, now }).proposal,
      command_capabilities: capabilities,
      unsupported_reason: capabilities.length ? null : LEOZOPS_UNSUPPORTED_PROPOSAL_ACTIONS[proposal.actionType] || 'No command capability is registered.',
    };
  });
  const intentIds = intents.map(intent => intent.id);
  const events = intentIds.length ? await db.leozOpsCommandEvent.findMany({
    where: { intentId: { in: intentIds } }, orderBy: [{ intentId: 'asc' }, { sequence: 'asc' }],
  }) : [];
  const eventsByIntent = new Map();
  for (const event of events) {
    if (!eventsByIntent.has(event.intentId)) eventsByIntent.set(event.intentId, []);
    eventsByIntent.get(event.intentId).push(event);
  }
  return {
    contract: 'leozops.command-inbox',
    version: 1,
    runtime: projectRuntime(runtime, env),
    capabilities: awaitedCapabilities(env),
    accepted_proposals: accepted,
    intents: intents.map(intent => projectCommandIntent(intent, { events: eventsByIntent.get(intent.id) || [], now })),
  };
}

function awaitedCapabilities(env) {
  return [
    'lead.followup.create', 'lead.expected_close.update', 'lead.source.update', 'lead.transition',
  ].map(id => {
    const definition = normalizeCommandIntent({
      contract: LEOZOPS_COMMAND_CONTRACT,
      version: LEOZOPS_COMMAND_VERSION,
      proposal_id: 'placeholder',
      capability: id,
      target_ref: 'placeholder',
      parameters: id === 'lead.followup.create' ? { kind: 'call', title: 'Follow up', date: '2099-01-01' }
        : id === 'lead.expected_close.update' ? { close_at: '2099-01-01' }
          : id === 'lead.source.update' ? { source: 'other' }
            : { next_stage: 'contacted' },
    }).capability;
    return capabilityProjection(definition, env);
  });
}

export function repositoryInputForIntent(intent) {
  const stored = validStoredIntent(intent);
  if (!stored) fail('Stored command intent failed integrity validation.', 409, 'leozops_command_integrity_invalid');
  return { ...stored.payload, idempotencyKey: intent.repositoryIdempotencyKey };
}
