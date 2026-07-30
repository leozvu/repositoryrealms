// Sprint 1C — atomic, idempotent persistence for proposal metadata only.

import {
  LEOZOPS_PROPOSAL_CONTRACT,
  LEOZOPS_PROPOSAL_VERSION,
  LeozOpsProposalError,
  hashProposalIdempotencyKey,
  serializeLeadActionProposal,
} from './proposal-contract.js';

function ensureReplayMatches(row, expected) {
  if (
    row.idempotencyKeyHash !== expected.idempotencyKeyHash
    ||
    row.requesterFingerprint !== expected.requesterFingerprint
    || row.correlationId !== expected.correlationId
    || row.briefId !== expected.draft.briefId
    || row.sourceSnapshotId !== expected.draft.sourceSnapshotId
    || row.signalId !== expected.draft.signalId
    || row.signalType !== expected.draft.signalType
    || row.actionType !== expected.draft.actionType
    || row.reasonCode !== expected.draft.reasonCode
    || row.evidenceHash !== expected.draft.evidenceHash
    || row.payloadHash !== expected.draft.payloadHash
  ) {
    throw new LeozOpsProposalError(
      'Idempotency key or correlation ID belongs to another proposal.',
      409,
      'leozops_proposal_idempotency_conflict',
    );
  }
}

async function findExisting(db, idempotencyKeyHash, correlationId) {
  const byKey = await db.leozOpsActionProposal.findUnique({ where: { idempotencyKeyHash } });
  const byCorrelation = await db.leozOpsActionProposal.findUnique({ where: { correlationId } });
  return byKey || byCorrelation;
}

export async function createLeadActionProposal(db, {
  requesterFingerprint,
  correlationId,
  idempotencyKey,
  draft,
  now = new Date(),
}) {
  const idempotencyKeyHash = hashProposalIdempotencyKey(idempotencyKey);
  const expected = { idempotencyKeyHash, requesterFingerprint, correlationId, draft };
  let result;
  try {
    result = await db.$transaction(async tx => {
      const existing = await findExisting(tx, idempotencyKeyHash, correlationId);
      if (existing) {
        ensureReplayMatches(existing, expected);
        return { row: existing, replayed: true };
      }

      const row = await tx.leozOpsActionProposal.create({
        data: {
          idempotencyKeyHash,
          correlationId,
          requesterFingerprint,
          briefId: draft.briefId,
          sourceSnapshotId: draft.sourceSnapshotId,
          signalId: draft.signalId,
          signalType: draft.signalType,
          actionType: draft.actionType,
          reasonCode: draft.reasonCode,
          leadRefs: JSON.stringify(draft.leadRefs),
          evidenceHash: draft.evidenceHash,
          payloadHash: draft.payloadHash,
          status: 'proposed',
          expiresAt: draft.expiresAt,
          createdAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: `service:leozops:${requesterFingerprint}`,
          userName: 'LeozOps proposal service',
          action: 'leozops_proposal_created',
          entity: 'leozops_action_proposal',
          refId: row.id,
          detail: `signal=${row.signalType}; action=${row.actionType}; status=proposed; correlation=${row.correlationId}`,
          at: now,
        },
      });
      return { row, replayed: false };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const existing = await findExisting(db, idempotencyKeyHash, correlationId);
    if (!existing) throw error;
    ensureReplayMatches(existing, expected);
    result = { row: existing, replayed: true };
  }

  return serializeLeadActionProposal(result.row, { replayed: result.replayed, now });
}

function safeProposalId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(normalized)) {
    throw new LeozOpsProposalError('Proposal id is invalid.', 400, 'leozops_proposal_id_invalid');
  }
  return normalized;
}

export async function listLeadActionProposals(db, {
  requesterFingerprint,
  proposalId = null,
  limit = 50,
  now = new Date(),
}) {
  const id = safeProposalId(proposalId);
  const take = Math.max(1, Math.min(Number(limit) || 50, 100));
  const rows = await db.leozOpsActionProposal.findMany({
    where: {
      requesterFingerprint,
      ...(id ? { id } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return {
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: LEOZOPS_PROPOSAL_VERSION,
    proposals: rows.map(row => serializeLeadActionProposal(row, { now }).proposal),
  };
}
