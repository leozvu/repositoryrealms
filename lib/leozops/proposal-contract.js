// Sprint 1C — strict wire contract for evidence-bound action proposals.
// A normalized proposal can be persisted for review but can never execute work.

import crypto from 'node:crypto';
import { canonicalStringify } from './projector.js';

export const LEOZOPS_PROPOSAL_CONTRACT = 'leozops.lead-action-proposal';
export const LEOZOPS_PROPOSAL_VERSION = 1;
export const LEOZOPS_PROPOSAL_MAX_BODY_BYTES = 16 * 1024;

export const SIGNAL_ACTION_POLICY = Object.freeze({
  unassigned_active_leads: Object.freeze({ actionType: 'review_lead_assignment', reasonCode: 'assignment_review' }),
  overdue_expected_close: Object.freeze({ actionType: 'review_expected_close', reasonCode: 'sla_review' }),
  late_stage_missing_close: Object.freeze({ actionType: 'complete_expected_close', reasonCode: 'data_quality_review' }),
  aging_active_leads: Object.freeze({ actionType: 'review_aging_leads', reasonCode: 'follow_up_review' }),
  missing_lead_source: Object.freeze({ actionType: 'complete_lead_source', reasonCode: 'data_quality_review' }),
  unknown_funnel_stage: Object.freeze({ actionType: 'review_funnel_stage', reasonCode: 'data_quality_review' }),
  no_active_leads: Object.freeze({ actionType: 'review_funnel_sync', reasonCode: 'sync_review' }),
});

const HASH_ID = /^sha256:[0-9a-f]{64}$/;
const SAFE_REF = /^[a-zA-Z0-9:_-]{1,160}$/;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9:_-]{16,160}$/;

export class LeozOpsProposalError extends Error {
  constructor(message, status = 400, code = 'leozops_proposal_invalid') {
    super(message);
    this.name = 'LeozOpsProposalError';
    this.status = status;
    this.code = code;
  }
}

function fail(message, status, code) {
  throw new LeozOpsProposalError(message, status, code);
}

function exactObject(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object.`, 400, 'leozops_proposal_body_invalid');
  }
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) fail(`${field} contains unsupported fields.`, 400, 'leozops_proposal_unknown_field');
}

function hashId(value, field) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!HASH_ID.test(normalized)) fail(`${field} is invalid.`, 400, `leozops_proposal_${field}_invalid`);
  return normalized;
}

function safeRef(value) {
  const normalized = String(value || '').trim();
  if (!SAFE_REF.test(normalized)) fail('lead_refs contains an invalid reference.', 400, 'leozops_proposal_lead_ref_invalid');
  return normalized;
}

function hash(value) {
  return crypto.createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

export function normalizeProposalIdempotencyKey(value) {
  const normalized = String(value || '').trim();
  if (!IDEMPOTENCY_KEY.test(normalized)) {
    fail('Idempotency-Key is required and invalid.', 400, 'leozops_proposal_idempotency_invalid');
  }
  return normalized;
}

export function hashProposalIdempotencyKey(value) {
  return crypto.createHash('sha256').update(normalizeProposalIdempotencyKey(value)).digest('hex');
}

function proposalExpiry(asOfDate) {
  const start = Date.parse(`${asOfDate}T00:00:00.000Z`);
  if (Number.isNaN(start)) fail('Current brief date is invalid.', 500, 'leozops_proposal_brief_invalid');
  return new Date(start + 86_400_000);
}

function normalizedLeadRefs(input, signal) {
  const evidenceRefs = Array.isArray(signal?.evidence?.sample_external_ids)
    ? signal.evidence.sample_external_ids.map(safeRef).sort()
    : [];
  const supplied = input === undefined
    ? evidenceRefs
    : (() => {
        if (!Array.isArray(input)) fail('lead_refs must be an array.', 400, 'leozops_proposal_lead_refs_invalid');
        if (input.length > 25) fail('lead_refs exceeds the safe limit.', 400, 'leozops_proposal_lead_refs_too_large');
        return [...new Set(input.map(safeRef))].sort();
      })();

  if (supplied.length !== (input === undefined ? evidenceRefs.length : input.length)) {
    fail('lead_refs must be unique.', 400, 'leozops_proposal_lead_refs_duplicate');
  }
  const allowed = new Set(evidenceRefs);
  if (supplied.some(ref => !allowed.has(ref))) {
    fail('lead_refs is not supported by the current signal evidence.', 409, 'leozops_proposal_evidence_mismatch');
  }
  if (evidenceRefs.length && !supplied.length) {
    fail('lead_refs cannot be empty for this signal.', 400, 'leozops_proposal_lead_refs_required');
  }
  return supplied;
}

export function normalizeLeadActionProposal(input, currentBrief) {
  exactObject(input, [
    'contract', 'version', 'brief_id', 'signal_id', 'action_type', 'reason_code', 'lead_refs',
  ], 'proposal');
  if (input.contract !== LEOZOPS_PROPOSAL_CONTRACT || input.version !== LEOZOPS_PROPOSAL_VERSION) {
    fail('Proposal contract version is unsupported.', 409, 'leozops_proposal_contract_unsupported');
  }
  if (!currentBrief || !Array.isArray(currentBrief.signals)) {
    fail('Current brief is unavailable.', 503, 'leozops_proposal_brief_unavailable');
  }

  const briefId = hashId(input.brief_id, 'brief_id');
  if (briefId !== currentBrief.brief_id) {
    fail('The referenced brief is stale.', 409, 'leozops_proposal_brief_stale');
  }
  const signalId = hashId(input.signal_id, 'signal_id');
  const signal = currentBrief.signals.find(item => item.signal_id === signalId);
  if (!signal) fail('The signal is not present in the current brief.', 409, 'leozops_proposal_signal_stale');
  if (signal.proposal?.mode !== 'proposal_only' || signal.proposal?.executable !== false) {
    fail('The signal is not proposal-safe.', 409, 'leozops_proposal_signal_unsafe');
  }

  const policy = SIGNAL_ACTION_POLICY[signal.type];
  if (!policy || signal.proposal.action_type !== policy.actionType) {
    fail('The signal action is outside policy.', 409, 'leozops_proposal_action_policy_mismatch');
  }
  const actionType = String(input.action_type || '').trim();
  if (actionType !== policy.actionType) {
    fail('action_type does not match the current signal.', 409, 'leozops_proposal_action_mismatch');
  }
  const reasonCode = String(input.reason_code || '').trim();
  if (reasonCode !== policy.reasonCode) {
    fail('reason_code does not match policy.', 400, 'leozops_proposal_reason_invalid');
  }

  const leadRefs = normalizedLeadRefs(input.lead_refs, signal);
  const evidenceHash = hash(signal.evidence);
  const payloadFacts = {
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: LEOZOPS_PROPOSAL_VERSION,
    brief_id: briefId,
    source_snapshot_id: currentBrief.source_snapshot_id,
    signal_id: signalId,
    signal_type: signal.type,
    action_type: actionType,
    reason_code: reasonCode,
    lead_refs: leadRefs,
    evidence_hash: evidenceHash,
  };

  return {
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: LEOZOPS_PROPOSAL_VERSION,
    briefId,
    sourceSnapshotId: currentBrief.source_snapshot_id,
    signalId,
    signalType: signal.type,
    actionType,
    reasonCode,
    leadRefs,
    evidenceHash,
    payloadHash: hash(payloadFacts),
    expiresAt: proposalExpiry(currentBrief.as_of_date),
  };
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function storedRefs(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || parsed.length > 25) return null;
    const refs = parsed.map(safeRef).sort();
    return new Set(refs).size === refs.length ? refs : null;
  } catch {
    return null;
  }
}

export function serializeLeadActionProposal(row, { replayed = false, now = new Date() } = {}) {
  const expiresAt = row?.expiresAt instanceof Date ? row.expiresAt : new Date(row?.expiresAt);
  const expired = !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= new Date(now).getTime();
  const refs = storedRefs(row?.leadRefs);
  const storedStatus = row?.status === 'proposed' && refs !== null ? 'proposed' : 'invalid';
  return {
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: LEOZOPS_PROPOSAL_VERSION,
    proposal: {
      id: row?.id,
      status: storedStatus === 'proposed' && expired ? 'expired' : storedStatus,
      stored_status: storedStatus,
      brief_id: row?.briefId,
      source_snapshot_id: row?.sourceSnapshotId,
      signal_id: row?.signalId,
      signal_type: row?.signalType,
      action_type: row?.actionType,
      reason_code: row?.reasonCode,
      lead_refs: refs || [],
      evidence_hash: row?.evidenceHash,
      payload_hash: row?.payloadHash,
      created_at: iso(row?.createdAt),
      expires_at: iso(row?.expiresAt),
      replayed,
      next_state: expired ? 'refresh_brief' : 'pending_internal_review',
      approval: { required: true, status: 'not_started' },
      execution: { allowed: false, status: 'not_started', receipt_id: null },
    },
  };
}
