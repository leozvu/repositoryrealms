// Sprint 1D — append-only human review administration.
// A review can record attention but cannot approve or execute a proposal.

import { isDirector } from '../perm.js';
import {
  LEOZOPS_PROPOSAL_CONTRACT,
  LEOZOPS_PROPOSAL_VERSION,
  normalizeLeadActionProposal,
  serializeLeadActionProposal,
} from './proposal-contract.js';
import {
  LEOZOPS_REVIEW_CONTRACT,
  LEOZOPS_REVIEW_GOVERNANCE_MODE,
  LEOZOPS_REVIEW_VERSION,
  LeozOpsReviewError,
  normalizeProposalReview,
} from './review-contract.js';

function fail(message, status, code) {
  throw new LeozOpsReviewError(message, status, code);
}

function requireDirector(user) {
  if (!user?.id) fail('Authentication is required.', 401, 'leozops_review_unauthorized');
  if (!isDirector(user)) fail('Director scope is required.', 403, 'leozops_review_director_required');
}

function safeProposalId(value) {
  const normalized = String(value || '').trim();
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(normalized)) {
    fail('Proposal id is invalid.', 400, 'leozops_review_proposal_id_invalid');
  }
  return normalized;
}

function storedProposalInput(row) {
  let leadRefs;
  try { leadRefs = JSON.parse(row.leadRefs); } catch { leadRefs = null; }
  return {
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: LEOZOPS_PROPOSAL_VERSION,
    brief_id: row.briefId,
    signal_id: row.signalId,
    action_type: row.actionType,
    reason_code: row.reasonCode,
    lead_refs: leadRefs,
  };
}

function ensureReviewable(row, currentBrief, decision, now) {
  if (!row || row.status !== 'proposed') {
    fail('Proposal is unavailable for review.', 409, 'leozops_review_proposal_unavailable');
  }
  const expiresAt = new Date(row.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    fail('Proposal evidence has expired.', 409, 'leozops_review_proposal_expired');
  }
  if (decision !== 'accept') return;
  if (!currentBrief) fail('Current brief is unavailable.', 503, 'leozops_review_brief_unavailable');
  let draft;
  try {
    draft = normalizeLeadActionProposal(storedProposalInput(row), currentBrief);
  } catch {
    fail('Proposal no longer matches the current brief.', 409, 'leozops_review_proposal_stale');
  }
  if (
    draft.briefId !== row.briefId
    || draft.sourceSnapshotId !== row.sourceSnapshotId
    || draft.signalId !== row.signalId
    || draft.signalType !== row.signalType
    || draft.actionType !== row.actionType
    || draft.reasonCode !== row.reasonCode
    || draft.evidenceHash !== row.evidenceHash
    || draft.payloadHash !== row.payloadHash
  ) {
    fail('Proposal integrity check failed.', 409, 'leozops_review_proposal_stale');
  }
}

function ensureReplayMatches(review, { proposal, user, normalized }) {
  if (
    review.proposalId !== proposal.id
    || review.reviewerId !== user.id
    || review.decision !== normalized.decision
    || review.reasonCode !== normalized.reasonCode
    || review.governanceMode !== LEOZOPS_REVIEW_GOVERNANCE_MODE
    || review.proposalPayloadHash !== proposal.payloadHash
  ) {
    fail('Proposal already has a different review.', 409, 'leozops_review_conflict');
  }
}

function reviewEnvelope(proposal, review, { replayed = false, now = new Date() } = {}) {
  return {
    contract: LEOZOPS_REVIEW_CONTRACT,
    version: LEOZOPS_REVIEW_VERSION,
    governance: {
      mode: LEOZOPS_REVIEW_GOVERNANCE_MODE,
      solo_operator: true,
      four_eyes_verified: false,
      grants_approval: false,
      grants_execution: false,
    },
    proposal: serializeLeadActionProposal(proposal, { review, now }).proposal,
    replayed,
  };
}

export async function reviewLeadActionProposal(db, user, {
  proposalId,
  correlationId,
  input,
  currentBrief = null,
  now = new Date(),
}) {
  requireDirector(user);
  const id = safeProposalId(proposalId);
  const normalized = normalizeProposalReview(input);
  try {
    return await db.$transaction(async tx => {
      const proposal = await tx.leozOpsActionProposal.findUnique({ where: { id } });
      if (!proposal) fail('Proposal was not found.', 404, 'leozops_review_proposal_not_found');
      const byProposal = await tx.leozOpsProposalReview.findUnique({ where: { proposalId: id } });
      const byCorrelation = await tx.leozOpsProposalReview.findUnique({ where: { correlationId } });
      if (byCorrelation && byCorrelation.proposalId !== id) {
        fail('Correlation ID belongs to another review.', 409, 'leozops_review_correlation_conflict');
      }
      if (byProposal) {
        ensureReplayMatches(byProposal, { proposal, user, normalized });
        return reviewEnvelope(proposal, byProposal, { replayed: true, now });
      }

      ensureReviewable(proposal, currentBrief, normalized.decision, now);
      const review = await tx.leozOpsProposalReview.create({
        data: {
          proposalId: proposal.id,
          correlationId,
          decision: normalized.decision,
          reasonCode: normalized.reasonCode,
          governanceMode: LEOZOPS_REVIEW_GOVERNANCE_MODE,
          reviewerId: user.id,
          proposalPayloadHash: proposal.payloadHash,
          reviewedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name || 'Director',
          action: normalized.decision === 'accept' ? 'leozops_review_accept' : 'leozops_review_reject',
          entity: 'leozops_proposal_review',
          refId: review.id,
          detail: `proposal=${proposal.id}; signal=${proposal.signalType}; reason=${normalized.reasonCode}; governance=${LEOZOPS_REVIEW_GOVERNANCE_MODE}; execution=false`,
          at: now,
        },
      });
      return reviewEnvelope(proposal, review, { now });
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const proposal = await db.leozOpsActionProposal.findUnique({ where: { id } });
    const byProposal = proposal && await db.leozOpsProposalReview.findUnique({ where: { proposalId: id } });
    const byCorrelation = await db.leozOpsProposalReview.findUnique({ where: { correlationId } });
    if (byCorrelation && byCorrelation.proposalId !== id) {
      fail('Correlation ID belongs to another review.', 409, 'leozops_review_correlation_conflict');
    }
    const review = byProposal || (byCorrelation?.proposalId === id ? byCorrelation : null);
    if (!proposal || !review) throw error;
    ensureReplayMatches(review, { proposal, user, normalized });
    return reviewEnvelope(proposal, review, { replayed: true, now });
  }
}

export async function listLeadActionProposalReviews(db, user, {
  limit = 100,
  now = new Date(),
} = {}) {
  requireDirector(user);
  const take = Math.max(1, Math.min(Number(limit) || 100, 100));
  const proposals = await db.leozOpsActionProposal.findMany({
    orderBy: { createdAt: 'desc' },
    take,
  });
  const reviews = proposals.length ? await db.leozOpsProposalReview.findMany({
    where: { proposalId: { in: proposals.map(row => row.id) } },
  }) : [];
  const reviewByProposal = new Map(reviews.map(review => [review.proposalId, review]));
  const rows = proposals.map(proposal => serializeLeadActionProposal(proposal, {
    review: reviewByProposal.get(proposal.id) || null,
    now,
  }).proposal);
  const pending = rows.filter(row => row.status === 'proposed' && row.review.status === 'pending');
  const recent = rows.filter(row => row.review.status !== 'pending' || row.status !== 'proposed').slice(0, 30);
  return {
    contract: LEOZOPS_REVIEW_CONTRACT,
    version: LEOZOPS_REVIEW_VERSION,
    governance: {
      mode: LEOZOPS_REVIEW_GOVERNANCE_MODE,
      solo_operator: true,
      four_eyes_verified: false,
      grants_approval: false,
      grants_execution: false,
    },
    summary: {
      pending: pending.length,
      accepted: rows.filter(row => row.review.status === 'accepted').length,
      rejected: rows.filter(row => row.review.status === 'rejected').length,
      expired: rows.filter(row => row.status === 'expired').length,
    },
    pending,
    recent,
  };
}
