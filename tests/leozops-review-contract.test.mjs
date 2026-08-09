import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEOZOPS_REVIEW_CONTRACT,
  LEOZOPS_REVIEW_GOVERNANCE_MODE,
  normalizeProposalReview,
  projectProposalReview,
} from '../lib/leozops/review-contract.js';

test('review contract accepts only exact decision/reason combinations', () => {
  assert.deepEqual(normalizeProposalReview({
    contract: LEOZOPS_REVIEW_CONTRACT,
    version: 1,
    decision: 'accept',
    reason_code: 'reviewed_current_evidence',
  }), { decision: 'accept', reasonCode: 'reviewed_current_evidence' });
  assert.throws(() => normalizeProposalReview({
    contract: LEOZOPS_REVIEW_CONTRACT,
    version: 1,
    decision: 'accept',
    reason_code: 'not_actionable',
  }), error => error.code === 'leozops_review_reason_invalid');
  assert.throws(() => normalizeProposalReview({
    contract: LEOZOPS_REVIEW_CONTRACT,
    version: '1',
    decision: 'reject',
    reason_code: 'not_actionable',
  }), error => error.code === 'leozops_review_contract_unsupported');
  assert.throws(() => normalizeProposalReview({
    contract: LEOZOPS_REVIEW_CONTRACT,
    version: 1,
    decision: 'reject',
    reason_code: 'not_actionable',
    note: 'possible PII',
  }), error => error.code === 'leozops_review_unknown_field');
});

test('review projection never discloses reviewer identity', () => {
  const output = projectProposalReview({
    decision: 'accept',
    reasonCode: 'reviewed_current_evidence',
    governanceMode: LEOZOPS_REVIEW_GOVERNANCE_MODE,
    reviewerId: 'private-director-id',
    reviewedAt: new Date('2026-07-29T13:00:00.000Z'),
  });
  assert.equal(output.status, 'accepted');
  assert.equal(output.reviewer_identity_disclosed, false);
  assert.ok(!JSON.stringify(output).includes('private-director-id'));
});

test('corrupt review facts project as invalid rather than accepted', () => {
  const output = projectProposalReview({
    decision: 'accept',
    reasonCode: 'wrong',
    governanceMode: LEOZOPS_REVIEW_GOVERNANCE_MODE,
    reviewedAt: 'not-a-date',
  });
  assert.equal(output.status, 'invalid');
  assert.equal(output.decision, null);
});
