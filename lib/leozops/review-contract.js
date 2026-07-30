// Sprint 1D — strict contract for a human review fact.
// Review acceptance records attention; it is never approval or execution.

export const LEOZOPS_REVIEW_CONTRACT = 'leozops.proposal-review';
export const LEOZOPS_REVIEW_VERSION = 1;
export const LEOZOPS_REVIEW_GOVERNANCE_MODE = 'single_operator_explicit_review';
export const LEOZOPS_REVIEW_MAX_BODY_BYTES = 4 * 1024;

export const REVIEW_REASON_POLICY = Object.freeze({
  accept: Object.freeze(['reviewed_current_evidence']),
  reject: Object.freeze([
    'not_actionable',
    'outside_current_priority',
    'duplicate_or_superseded',
    'stale_or_incorrect',
  ]),
});

export class LeozOpsReviewError extends Error {
  constructor(message, status = 400, code = 'leozops_review_invalid') {
    super(message);
    this.name = 'LeozOpsReviewError';
    this.status = status;
    this.code = code;
  }
}

function fail(message, status, code) {
  throw new LeozOpsReviewError(message, status, code);
}

function exactObject(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Review body must be an object.', 400, 'leozops_review_body_invalid');
  }
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    fail('Review body contains unsupported fields.', 400, 'leozops_review_unknown_field');
  }
}

export function normalizeProposalReview(input) {
  exactObject(input, ['contract', 'version', 'decision', 'reason_code']);
  if (input.contract !== LEOZOPS_REVIEW_CONTRACT || input.version !== LEOZOPS_REVIEW_VERSION) {
    fail('Review contract version is unsupported.', 409, 'leozops_review_contract_unsupported');
  }
  const decision = String(input.decision || '').trim();
  if (!Object.hasOwn(REVIEW_REASON_POLICY, decision)) {
    fail('Review decision is invalid.', 400, 'leozops_review_decision_invalid');
  }
  const reasonCode = String(input.reason_code || '').trim();
  if (!REVIEW_REASON_POLICY[decision].includes(reasonCode)) {
    fail('Review reason is not allowed for this decision.', 400, 'leozops_review_reason_invalid');
  }
  return { decision, reasonCode };
}

export function projectProposalReview(review) {
  if (!review) {
    return {
      required: true,
      governance_mode: LEOZOPS_REVIEW_GOVERNANCE_MODE,
      status: 'pending',
      decision: null,
      reason_code: null,
      reviewed_at: null,
      reviewer_identity_disclosed: false,
    };
  }
  const reviewedAt = new Date(review.reviewedAt);
  const valid = ['accept', 'reject'].includes(review.decision)
    && REVIEW_REASON_POLICY[review.decision]?.includes(review.reasonCode)
    && review.governanceMode === LEOZOPS_REVIEW_GOVERNANCE_MODE
    && !Number.isNaN(reviewedAt.getTime());
  return {
    required: true,
    governance_mode: valid ? review.governanceMode : LEOZOPS_REVIEW_GOVERNANCE_MODE,
    status: valid ? (review.decision === 'accept' ? 'accepted' : 'rejected') : 'invalid',
    decision: valid ? review.decision : null,
    reason_code: valid ? review.reasonCode : null,
    reviewed_at: valid ? reviewedAt.toISOString() : null,
    reviewer_identity_disclosed: false,
  };
}
