import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256hex } from '../lib/leozops/auth.js';
import { buildLeadBrief } from '../lib/leozops/brief-projector.js';
import { handleLeadActionProposals } from '../lib/leozops/proposal-handler.js';
import { LEOZOPS_PROPOSAL_CONTRACT } from '../lib/leozops/proposal-contract.js';
import { _resetRateLimit } from '../lib/leozops/ratelimit.js';
import { createProposalDb } from './helpers/leozops-proposal-db.mjs';

const KEY = 'lozk_action_proposal_write_key';
const SNAPSHOT_KEY = 'lozk_snapshot_read_key';
const BRIEF_KEY = 'lozk_brief_read_key';
const HASH = sha256hex(KEY);
const ON = { LEOZOPS_PROPOSAL_ENABLED: 'true', LEOZOPS_PROPOSAL_WRITE_KEY_HASH: HASH };
const NOW = Date.parse('2026-07-29T12:00:00.000Z');
const CORRELATION = '11111111-2222-4333-8444-555555555555';
const LEADS = [
  { id: 'lead-safe-1', source: null, value: 100, stage: 'new', ownerId: null, createdAt: '2026-07-01', expectedClose: null },
];

function proposalBody() {
  const brief = buildLeadBrief(LEADS, {
    generatedAt: new Date(NOW).toISOString(), asOf: '2026-07-29',
  });
  const signal = brief.signals.find(item => item.type === 'unassigned_active_leads');
  return {
    contract: LEOZOPS_PROPOSAL_CONTRACT,
    version: 1,
    brief_id: brief.brief_id,
    signal_id: signal.signal_id,
    action_type: signal.proposal.action_type,
    reason_code: 'assignment_review',
    lead_refs: signal.evidence.sample_external_ids,
  };
}

function request({
  method = 'POST', key = KEY, body = proposalBody(), idempotencyKey = 'idem_proposal_00000001',
  headers = {}, url = 'https://erp-egoric.vercel.app/api/integrations/leozops/v1/action-proposals',
} = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const all = {
    authorization: key === null ? null : `Bearer ${key}`,
    'idempotency-key': idempotencyKey,
    'x-correlation-id': CORRELATION,
    'content-type': 'application/json',
    ...headers,
  };
  return {
    method,
    url,
    headers: { get: name => all[name.toLowerCase()] ?? null },
    text: async () => raw,
  };
}

function options(overrides = {}) {
  const { db, state } = createProposalDb();
  return {
    state,
    opts: {
      env: ON,
      db,
      loadLeads: async () => LEADS,
      now: () => NOW,
      uuid: () => CORRELATION,
      log: () => {},
      ...overrides,
    },
  };
}

test('default-off route is absent and does not touch storage', async () => {
  _resetRateLimit();
  const { opts, state } = options({ env: { LEOZOPS_PROPOSAL_WRITE_KEY_HASH: HASH } });
  const response = await handleLeadActionProposals(request(), opts);
  assert.equal(response.status, 404);
  assert.equal(state.proposals.length, 0);
});

test('only GET and POST exist while the feature is enabled', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    _resetRateLimit();
    const { opts } = options();
    const response = await handleLeadActionProposals(request({ method }), opts);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.Allow, 'GET, POST');
  }
});

test('proposal route requires its separate write key', async () => {
  for (const key of [null, 'wrong', SNAPSHOT_KEY, BRIEF_KEY]) {
    _resetRateLimit();
    const { opts } = options();
    assert.equal((await handleLeadActionProposals(request({ key }), opts)).status, 401);
  }
  _resetRateLimit();
  const { opts } = options();
  assert.equal((await handleLeadActionProposals(request(), opts)).status, 201);
});

test('valid POST persists a proposal, and an exact retry is idempotent', async () => {
  _resetRateLimit();
  const { opts, state } = options();
  const created = await handleLeadActionProposals(request(), opts);
  assert.equal(created.status, 201);
  assert.equal(created.body.proposal.status, 'proposed');
  assert.equal(created.body.proposal.execution.allowed, false);
  assert.equal(created.headers['Cache-Control'], 'private, no-store');
  const replay = await handleLeadActionProposals(request(), opts);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.proposal.replayed, true);
  assert.equal(state.proposals.length, 1);
  assert.equal(state.audits.length, 1);
});

test('POST requires idempotency, valid JSON and a current brief', async () => {
  const cases = [
    [request({ idempotencyKey: null }), 400, 'leozops_proposal_idempotency_invalid'],
    [request({ headers: { 'content-type': 'text/plain' } }), 415, 'leozops_proposal_content_type_unsupported'],
    [request({ body: '{bad json' }), 400, 'leozops_proposal_json_invalid'],
    [request({ body: { ...proposalBody(), brief_id: `sha256:${'0'.repeat(64)}` } }), 409, 'leozops_proposal_brief_stale'],
  ];
  for (const [req, status, code] of cases) {
    _resetRateLimit();
    const { opts } = options();
    const response = await handleLeadActionProposals(req, opts);
    assert.equal(response.status, status);
    assert.equal(response.body.code, code);
  }
});

test('body byte limit is enforced from the header and measured payload', async () => {
  for (const req of [
    request({ headers: { 'content-length': '20000' } }),
    request({ body: 'x'.repeat(16 * 1024 + 1) }),
  ]) {
    _resetRateLimit();
    const { opts } = options();
    const response = await handleLeadActionProposals(req, opts);
    assert.equal(response.status, 413);
    assert.equal(response.body.code, 'leozops_proposal_body_too_large');
  }
});

test('GET lists proposals through the same proposal credential only', async () => {
  _resetRateLimit();
  const { opts } = options();
  const created = await handleLeadActionProposals(request(), opts);
  const listed = await handleLeadActionProposals(request({
    method: 'GET',
    url: `https://erp-egoric.vercel.app/api/integrations/leozops/v1/action-proposals?id=${created.body.proposal.id}&limit=1`,
  }), opts);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.proposals.length, 1);
  assert.equal(listed.body.proposals[0].id, created.body.proposal.id);
  assert.equal(listed.body.proposals[0].execution.allowed, false);
});

test('best-effort rate limit is isolated and returns Retry-After', async () => {
  _resetRateLimit();
  const { opts } = options({ rateLimit: { limit: 1, windowMs: 3_600_000 } });
  assert.equal((await handleLeadActionProposals(request({ method: 'GET' }), opts)).status, 200);
  const denied = await handleLeadActionProposals(request({ method: 'GET' }), opts);
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers['Retry-After']) > 0);
});

test('audit output contains no raw key, lead refs, owner or malformed correlation input', async () => {
  _resetRateLimit();
  const lines = [];
  const malicious = 'victim@example.com\r\nAuthorization: Bearer secret';
  const { opts } = options({ log: line => lines.push(String(line)) });
  const response = await handleLeadActionProposals(request({
    headers: { 'x-correlation-id': malicious },
  }), opts);
  assert.equal(response.status, 201);
  assert.equal(response.headers['X-Correlation-ID'], CORRELATION);
  assert.equal(lines.length, 1);
  for (const secret of [KEY, 'lead-safe-1', 'private-owner', 'victim@example.com', 'Bearer secret']) {
    assert.ok(!lines[0].includes(secret), secret);
  }
  const event = JSON.parse(lines[0]);
  assert.equal(event.evt, 'leozops_action_proposal');
  assert.equal(event.key_fingerprint, HASH.slice(0, 8));
});

test('source and storage failures fail closed without leaking internal details', async () => {
  for (const overrides of [
    { loadLeads: async () => { throw new Error('secret-database-password'); } },
    { db: { $transaction: async () => { throw new Error('secret-storage-dsn'); } } },
  ]) {
    _resetRateLimit();
    const lines = [];
    const { opts } = options({ ...overrides, log: line => lines.push(String(line)) });
    const response = await handleLeadActionProposals(request(), opts);
    assert.equal(response.status, 500);
    assert.equal(response.body.code, 'leozops_proposal_unavailable');
    assert.ok(!JSON.stringify(response).includes('secret-'));
    assert.ok(!lines[0].includes('secret-'));
  }
});
