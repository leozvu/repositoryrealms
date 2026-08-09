// Sprint 1C — HTTP boundary for durable, evidence-bound action proposals.
// This handler can record a proposal for later review. It cannot approve or
// execute the proposed action and deliberately has no business-entity writer.

import crypto from 'node:crypto';
import { verifyBearerHash } from './auth.js';
import { buildLeadBrief } from './brief-projector.js';
import { correlationIdOf, headerOf, pathOf } from './http.js';
import {
  LEOZOPS_PROPOSAL_MAX_BODY_BYTES,
  LeozOpsProposalError,
  normalizeLeadActionProposal,
  normalizeProposalIdempotencyKey,
} from './proposal-contract.js';
import { createLeadActionProposal, listLeadActionProposals } from './proposal-admin.js';
import { checkRateLimit } from './ratelimit.js';

const ROUTE_PATH = '/api/integrations/leozops/v1/action-proposals';
const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' };

function knownError(error) {
  return error instanceof LeozOpsProposalError
    ? error
    : new LeozOpsProposalError('Proposal service is unavailable.', 500, 'leozops_proposal_unavailable');
}

function parseLimit(url) {
  const raw = url.searchParams.get('limit');
  if (raw === null) return 50;
  if (!/^\d{1,3}$/.test(raw)) {
    throw new LeozOpsProposalError('limit must be an integer from 1 to 100.', 400, 'leozops_proposal_limit_invalid');
  }
  const value = Number(raw);
  if (value < 1 || value > 100) {
    throw new LeozOpsProposalError('limit must be an integer from 1 to 100.', 400, 'leozops_proposal_limit_invalid');
  }
  return value;
}

function requestUrl(req) {
  try { return new URL(req.url); } catch { return new URL(`https://invalid.local${ROUTE_PATH}`); }
}

async function readBoundedText(req) {
  if (req.body && typeof req.body.getReader === 'function') {
    const reader = req.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > LEOZOPS_PROPOSAL_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new LeozOpsProposalError('Proposal body is too large.', 413, 'leozops_proposal_body_too_large');
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  }
  if (typeof req.text !== 'function') {
    throw new LeozOpsProposalError('Proposal body is invalid.', 400, 'leozops_proposal_body_invalid');
  }
  return req.text();
}

async function readJsonBody(req) {
  const contentType = headerOf(req, 'content-type');
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;.*)?$/i.test(contentType.trim())) {
    throw new LeozOpsProposalError(
      'Content-Type must be application/json.',
      415,
      'leozops_proposal_content_type_unsupported',
    );
  }
  const declared = headerOf(req, 'content-length');
  if (declared !== null) {
    if (!/^\d+$/.test(declared.trim())) {
      throw new LeozOpsProposalError('Content-Length is invalid.', 400, 'leozops_proposal_content_length_invalid');
    }
    if (Number(declared) > LEOZOPS_PROPOSAL_MAX_BODY_BYTES) {
      throw new LeozOpsProposalError('Proposal body is too large.', 413, 'leozops_proposal_body_too_large');
    }
  }
  const raw = await readBoundedText(req);
  if (Buffer.byteLength(raw, 'utf8') > LEOZOPS_PROPOSAL_MAX_BODY_BYTES) {
    throw new LeozOpsProposalError('Proposal body is too large.', 413, 'leozops_proposal_body_too_large');
  }
  if (!raw.trim()) {
    throw new LeozOpsProposalError('Proposal body is required.', 400, 'leozops_proposal_body_invalid');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new LeozOpsProposalError('Proposal body must be valid JSON.', 400, 'leozops_proposal_json_invalid');
  }
}

export async function handleLeadActionProposals(req, opts = {}) {
  const {
    env = {},
    db,
    loadLeads,
    now = () => Date.now(),
    uuid = () => crypto.randomUUID(),
    log = (...args) => console.log(...args),
    rateLimit = { limit: 30, windowMs: 3_600_000 },
  } = opts;

  if (env.LEOZOPS_PROPOSAL_ENABLED !== 'true') {
    return { status: 404, headers: {}, body: { error: 'not found' } };
  }

  const start = now();
  const method = String(req.method || 'GET').toUpperCase();
  const correlationId = correlationIdOf(req, uuid);
  const requestPath = pathOf(req, ROUTE_PATH);
  const withCorrelation = (extra = {}) => ({ 'X-Correlation-ID': correlationId, ...extra });

  const audit = (status, {
    fingerprint = null,
    proposalId = null,
    replayed = null,
    errorCode = null,
  } = {}) => {
    log(JSON.stringify({
      evt: 'leozops_action_proposal',
      correlation_id: correlationId,
      key_fingerprint: fingerprint,
      path: requestPath,
      method,
      status,
      latency_ms: now() - start,
      proposal_id: proposalId,
      replayed,
      error_code: errorCode,
    }));
  };

  if (!['GET', 'POST'].includes(method)) {
    audit(405);
    return {
      status: 405,
      headers: withCorrelation({ Allow: 'GET, POST', ...CACHE_HEADERS }),
      body: { error: 'method not allowed' },
    };
  }

  const expectedHash = env.LEOZOPS_PROPOSAL_WRITE_KEY_HASH;
  const { ok, fingerprint } = verifyBearerHash(req, expectedHash);
  if (!ok) {
    audit(401, { fingerprint });
    return {
      status: 401,
      headers: withCorrelation(CACHE_HEADERS),
      body: { error: 'unauthorized' },
    };
  }

  const rate = checkRateLimit(`action-proposals:${expectedHash}`, {
    now: start,
    limit: rateLimit.limit,
    windowMs: rateLimit.windowMs,
  });
  if (!rate.ok) {
    audit(429, { fingerprint, errorCode: 'leozops_proposal_rate_limited' });
    return {
      status: 429,
      headers: withCorrelation({ ...CACHE_HEADERS, 'Retry-After': String(rate.retryAfter) }),
      body: { error: 'rate limit exceeded', code: 'leozops_proposal_rate_limited' },
    };
  }

  try {
    // Persist a full collision-resistant scope identifier, not the short audit
    // fingerprint and not the bearer verifier itself.
    const requesterScope = crypto.createHash('sha256')
      .update(`leozops-proposal-scope:${expectedHash.toLowerCase()}`)
      .digest('hex');
    if (method === 'GET') {
      const url = requestUrl(req);
      const body = await listLeadActionProposals(db, {
        requesterFingerprint: requesterScope,
        proposalId: url.searchParams.get('id'),
        limit: parseLimit(url),
        now: new Date(now()),
      });
      audit(200, { fingerprint });
      return { status: 200, headers: withCorrelation(CACHE_HEADERS), body };
    }

    const idempotencyKey = normalizeProposalIdempotencyKey(headerOf(req, 'idempotency-key'));
    const input = await readJsonBody(req);
    const rawLeads = await loadLeads();
    const generatedAt = new Date(now()).toISOString();
    const currentBrief = buildLeadBrief(rawLeads, {
      generatedAt,
      asOf: generatedAt.slice(0, 10),
    });
    const draft = normalizeLeadActionProposal(input, currentBrief);
    const body = await createLeadActionProposal(db, {
      requesterFingerprint: requesterScope,
      correlationId,
      idempotencyKey,
      draft,
      now: new Date(now()),
    });
    const status = body.proposal.replayed ? 200 : 201;
    audit(status, {
      fingerprint,
      proposalId: body.proposal.id,
      replayed: body.proposal.replayed,
    });
    return { status, headers: withCorrelation(CACHE_HEADERS), body };
  } catch (caught) {
    const error = knownError(caught);
    audit(error.status, { fingerprint, errorCode: error.code });
    return {
      status: error.status,
      headers: withCorrelation(CACHE_HEADERS),
      body: { error: error.message, code: error.code },
    };
  }
}
