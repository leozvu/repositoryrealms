// Sprint 1D — session-authenticated Director review HTTP boundary.

import crypto from 'node:crypto';
import { buildLeadBrief } from './brief-projector.js';
import { correlationIdOf, headerOf, pathOf } from './http.js';
import { checkRateLimit } from './ratelimit.js';
import {
  LEOZOPS_REVIEW_MAX_BODY_BYTES,
  LeozOpsReviewError,
  normalizeProposalReview,
} from './review-contract.js';
import { listLeadActionProposalReviews, reviewLeadActionProposal } from './review-admin.js';

const INBOX_PATH = '/api/leozops/action-proposals';
const REVIEW_PATH = '/api/leozops/action-proposals/:id/review';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function responseError(error) {
  return error instanceof LeozOpsReviewError
    ? error
    : new LeozOpsReviewError('Review service is unavailable.', 500, 'leozops_review_unavailable');
}

async function readBoundedJson(req) {
  const contentType = headerOf(req, 'content-type');
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;.*)?$/i.test(contentType.trim())) {
    throw new LeozOpsReviewError('Content-Type must be application/json.', 415, 'leozops_review_content_type_unsupported');
  }
  const declared = headerOf(req, 'content-length');
  if (declared !== null) {
    if (!/^\d+$/.test(declared.trim())) {
      throw new LeozOpsReviewError('Content-Length is invalid.', 400, 'leozops_review_content_length_invalid');
    }
    if (Number(declared) > LEOZOPS_REVIEW_MAX_BODY_BYTES) {
      throw new LeozOpsReviewError('Review body is too large.', 413, 'leozops_review_body_too_large');
    }
  }

  let raw;
  if (req.body && typeof req.body.getReader === 'function') {
    const reader = req.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > LEOZOPS_REVIEW_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new LeozOpsReviewError('Review body is too large.', 413, 'leozops_review_body_too_large');
      }
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks, bytes).toString('utf8');
  } else if (typeof req.text === 'function') {
    raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > LEOZOPS_REVIEW_MAX_BODY_BYTES) {
      throw new LeozOpsReviewError('Review body is too large.', 413, 'leozops_review_body_too_large');
    }
  } else {
    throw new LeozOpsReviewError('Review body is invalid.', 400, 'leozops_review_body_invalid');
  }
  try { return JSON.parse(raw); }
  catch { throw new LeozOpsReviewError('Review body must be valid JSON.', 400, 'leozops_review_json_invalid'); }
}

function reviewerFingerprint(userId) {
  return userId ? crypto.createHash('sha256').update(`leozops-reviewer:${userId}`).digest('hex').slice(0, 12) : null;
}

function auditLogger({ log, now, start, correlationId, path, method, userId = null }) {
  return (status, { proposalId = null, decision = null, replayed = null, errorCode = null } = {}) => {
    log(JSON.stringify({
      evt: 'leozops_proposal_review',
      correlation_id: correlationId,
      path,
      method,
      status,
      latency_ms: now() - start,
      reviewer_fingerprint: reviewerFingerprint(userId),
      proposal_id: proposalId,
      decision,
      replayed,
      error_code: errorCode,
    }));
  };
}

export async function handleProposalReviewInbox(req, opts = {}) {
  const {
    env = {}, db, getUser,
    now = () => Date.now(), uuid = () => crypto.randomUUID(),
    log = (...args) => console.log(...args),
    rateLimit = { limit: 60, windowMs: 3_600_000 },
  } = opts;
  if (env.LEOZOPS_REVIEW_ENABLED !== 'true') {
    return { status: 404, headers: {}, body: { error: 'not found' } };
  }
  const start = now();
  const correlationId = correlationIdOf(req, uuid);
  const method = String(req.method || 'GET').toUpperCase();
  const withHeaders = extra => ({ 'X-Correlation-ID': correlationId, ...NO_STORE, ...extra });
  let user = null;
  let audit = auditLogger({ log, now, start, correlationId, path: pathOf(req, INBOX_PATH), method });
  if (method !== 'GET') {
    audit(405);
    return { status: 405, headers: withHeaders({ Allow: 'GET' }), body: { error: 'method not allowed' } };
  }
  try {
    user = await getUser();
    if (!user) throw new LeozOpsReviewError('Authentication is required.', 401, 'leozops_review_unauthorized');
    audit = auditLogger({ log, now, start, correlationId, path: pathOf(req, INBOX_PATH), method, userId: user.id });
    const rate = checkRateLimit(`proposal-review-inbox:${user.id}`, {
      now: start, limit: rateLimit.limit, windowMs: rateLimit.windowMs,
    });
    if (!rate.ok) {
      throw new LeozOpsReviewError('Rate limit exceeded.', 429, 'leozops_review_rate_limited');
    }
    const body = await listLeadActionProposalReviews(db, user, { now: new Date(now()) });
    audit(200);
    return { status: 200, headers: withHeaders({}), body };
  } catch (caught) {
    const error = responseError(caught);
    audit(error.status, { errorCode: error.code });
    return { status: error.status, headers: withHeaders({}), body: { error: error.message, code: error.code } };
  }
}

export async function handleProposalReviewDecision(req, opts = {}) {
  const {
    env = {}, db, getUser, loadLeads, proposalId,
    now = () => Date.now(), uuid = () => crypto.randomUUID(),
    log = (...args) => console.log(...args),
    rateLimit = { limit: 30, windowMs: 3_600_000 },
  } = opts;
  if (env.LEOZOPS_REVIEW_ENABLED !== 'true') {
    return { status: 404, headers: {}, body: { error: 'not found' } };
  }
  const start = now();
  const correlationId = correlationIdOf(req, uuid);
  const method = String(req.method || 'POST').toUpperCase();
  const requestPath = pathOf(req, REVIEW_PATH);
  const withHeaders = extra => ({ 'X-Correlation-ID': correlationId, ...NO_STORE, ...extra });
  let user = null;
  let audit = auditLogger({ log, now, start, correlationId, path: requestPath, method });
  if (method !== 'POST') {
    audit(405, { proposalId });
    return { status: 405, headers: withHeaders({ Allow: 'POST' }), body: { error: 'method not allowed' } };
  }
  try {
    user = await getUser();
    if (!user) throw new LeozOpsReviewError('Authentication is required.', 401, 'leozops_review_unauthorized');
    audit = auditLogger({ log, now, start, correlationId, path: requestPath, method, userId: user.id });
    const rate = checkRateLimit(`proposal-review-decision:${user.id}`, {
      now: start, limit: rateLimit.limit, windowMs: rateLimit.windowMs,
    });
    if (!rate.ok) throw new LeozOpsReviewError('Rate limit exceeded.', 429, 'leozops_review_rate_limited');
    const input = await readBoundedJson(req);
    const normalized = normalizeProposalReview(input);
    let currentBrief = null;
    if (normalized.decision === 'accept') {
      const rawLeads = await loadLeads();
      const generatedAt = new Date(now()).toISOString();
      currentBrief = buildLeadBrief(rawLeads, { generatedAt, asOf: generatedAt.slice(0, 10) });
    }
    const body = await reviewLeadActionProposal(db, user, {
      proposalId,
      correlationId,
      input,
      currentBrief,
      now: new Date(now()),
    });
    const status = body.replayed ? 200 : 201;
    audit(status, { proposalId, decision: normalized.decision, replayed: body.replayed });
    return { status, headers: withHeaders({}), body };
  } catch (caught) {
    const error = responseError(caught);
    audit(error.status, { proposalId, errorCode: error.code });
    return { status: error.status, headers: withHeaders({}), body: { error: error.message, code: error.code } };
  }
}
