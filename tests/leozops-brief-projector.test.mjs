import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIEF_POLICY,
  buildLeadBrief,
} from '../lib/leozops/brief-projector.js';

const GENERATED = '2026-07-29T12:00:00.000Z';
const AS_OF = '2026-07-29';

const RAW = [
  {
    id: 'lead-new-unassigned', name: 'Secret Person', company: 'Secret Co', email: 'secret@example.com',
    phone: '0900000000', note: 'private note', source: null, value: 100, stage: 'new', ownerId: null,
    createdAt: '2026-07-01', expectedClose: null,
  },
  {
    id: 'lead-proposal-overdue', source: 'facebook', value: 200, stage: 'proposal', ownerId: 'user-private-1',
    createdAt: '2026-06-01', expectedClose: '2026-07-15',
  },
  {
    id: 'lead-negotiation-no-close', source: 'referral', value: 300, stage: 'negotiation', ownerId: 'user-private-2',
    createdAt: '2026-07-20', expectedClose: null,
  },
  {
    id: 'lead-won', source: 'direct', value: 400, stage: 'won', ownerId: 'user-private-3',
    createdAt: '2026-06-10', expectedClose: '2026-07-10',
  },
  {
    id: 'lead-unknown', source: 'import', value: null, stage: 'qualified', ownerId: null,
    createdAt: 'yesterday', expectedClose: 'soon',
  },
];

const build = (raw = RAW, over = {}) => buildLeadBrief(raw, {
  generatedAt: GENERATED,
  asOf: AS_OF,
  ...over,
});

test('brief exposes the fixed aggregate contract and no executable actions', () => {
  const brief = build();
  assert.deepEqual(Object.keys(brief), [
    'schema_version', 'source', 'brief_id', 'source_snapshot_id', 'generated_at', 'as_of_date',
    'policy', 'funnel_definition', 'metrics', 'attention', 'signals', 'quality', 'limitations',
  ]);
  assert.equal(brief.schema_version, '1.0');
  assert.equal(brief.as_of_date, AS_OF);
  assert.equal(brief.metrics.total_leads, 5);
  assert.equal(brief.metrics.active_leads, 3);
  assert.equal(brief.metrics.terminal_leads, 1);
  assert.equal(brief.metrics.unknown_stage_leads, 1);
  assert.equal(brief.metrics.owner_coverage.assigned_active, 2);
  assert.equal(brief.metrics.owner_coverage.unassigned_active, 1);
  assert.equal(brief.metrics.value_unit, 'source_native_unlabeled');
  assert.ok(brief.brief_id.startsWith('sha256:'));
  assert.ok(brief.source_snapshot_id.startsWith('sha256:'));
  assert.ok(brief.signals.every(signal => signal.proposal.mode === 'proposal_only'));
  assert.ok(brief.signals.every(signal => signal.proposal.requires_human_review === true));
  assert.ok(brief.signals.every(signal => signal.proposal.executable === false));
  assert.equal(brief.limitations.executable_actions, false);
});

test('policy signals cover ownership, close-date, aging, attribution and stage-contract gaps', () => {
  const brief = build();
  const types = new Set(brief.signals.map(signal => signal.type));
  for (const expected of [
    'unassigned_active_leads',
    'overdue_expected_close',
    'late_stage_missing_close',
    'aging_active_leads',
    'missing_lead_source',
    'unknown_funnel_stage',
  ]) {
    assert.ok(types.has(expected), `missing signal ${expected}`);
  }
  const overdue = brief.signals.find(signal => signal.type === 'overdue_expected_close');
  assert.equal(overdue.severity, 'high');
  assert.deepEqual(overdue.evidence.sample_external_ids, ['lead-proposal-overdue']);
  assert.equal(overdue.evidence.estimated_value_total, 200);
  assert.equal(brief.attention.high, 3);
  assert.equal(brief.attention.medium, 2);
  assert.equal(brief.attention.low, 1);
});

test('brief recursively excludes PII keys, values and owner identities', () => {
  const brief = build();
  const bannedKeys = ['name', 'company', 'email', 'phone', 'note', 'ownerId', 'owner_id', 'password', 'invoice'];
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      assert.ok(!bannedKeys.includes(key), `banned key ${key}`);
      walk(value);
    }
  };
  walk(brief);
  const serialized = JSON.stringify(brief);
  for (const secret of ['Secret Person', 'Secret Co', 'secret@example.com', '0900000000', 'private note', 'user-private']) {
    assert.ok(!serialized.includes(secret), `PII value leaked: ${secret}`);
  }
});

test('brief_id is deterministic across input order and generated time on the same as-of date', () => {
  const a = build(RAW, { generatedAt: '2026-07-29T01:00:00.000Z' });
  const b = build([...RAW].reverse(), { generatedAt: '2026-07-29T23:59:59.000Z' });
  assert.equal(a.brief_id, b.brief_id);
  assert.equal(a.source_snapshot_id, b.source_snapshot_id);
  assert.notEqual(a.generated_at, b.generated_at);
});

test('as-of date participates in the brief facts and changes the brief_id', () => {
  const a = build();
  const b = build(RAW, { asOf: '2026-07-30' });
  assert.notEqual(a.brief_id, b.brief_id);
  assert.equal(b.as_of_date, '2026-07-30');
});

test('quality records invalid dates, values and unknown stages without inventing metrics', () => {
  const brief = build();
  assert.equal(brief.quality.invalid_created_at, 1);
  assert.equal(brief.quality.invalid_expected_close_at, 1);
  assert.equal(brief.quality.invalid_estimated_value, 1);
  assert.equal(brief.quality.unknown_stage, 1);
  assert.equal(brief.limitations.historical_transitions_available, false);
  assert.equal(brief.limitations.conversion_rate, null);
  assert.equal(brief.limitations.stage_velocity, null);
  assert.equal(brief.limitations.last_activity_available, false);
});

test('evidence samples are bounded and report the remaining count', () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    id: `lead-${String(index).padStart(2, '0')}`,
    source: 'direct', value: index, stage: 'new', ownerId: null,
    createdAt: AS_OF, expectedClose: null,
  }));
  const brief = build(many);
  const signal = brief.signals.find(item => item.type === 'unassigned_active_leads');
  assert.equal(signal.evidence.lead_count, 30);
  assert.equal(signal.evidence.sample_external_ids.length, BRIEF_POLICY.sample_reference_limit);
  assert.equal(signal.evidence.remaining_count, 5);
});

test('an empty active funnel is explicit but never presented as a success', () => {
  const brief = build([{
    id: 'won-only', source: 'direct', value: 10, stage: 'won', ownerId: 'u1',
    createdAt: '2026-07-01', expectedClose: '2026-07-20',
  }]);
  assert.deepEqual(brief.signals.map(signal => signal.type), ['no_active_leads']);
  assert.equal(brief.signals[0].severity, 'info');
  assert.equal(brief.signals[0].proposal.executable, false);
});

test('invalid as-of input fails closed at the pure contract boundary', () => {
  assert.throws(() => buildLeadBrief(RAW, { generatedAt: GENERATED, asOf: '29/07/2026' }), /asOf/);
  assert.throws(() => buildLeadBrief(RAW, { generatedAt: GENERATED, asOf: '2026-02-30' }), /asOf/);
});
