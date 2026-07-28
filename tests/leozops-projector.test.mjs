// Sprint 1A — T1 tests: deterministic snapshot_id + strict allowlist projection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshot,
  projectLead,
  LEAD_ALLOWLIST,
  computeSnapshotId,
  funnelDefinition,
} from '../lib/leozops/projector.js';

// A raw lead carrying LOTS of PII-like fields that must never surface.
const rawLeads = [
  { id: 'cuid_b', name: 'Nguyễn A', company: 'ACME', email: 'a@x.com', phone: '090', note: 'secret', source: 'fb', value: 5000, stage: 'new', ownerId: 'u1', createdAt: '2026-01-02', expectedClose: '2026-03-01', password: 'p', invoice: 'INV1' },
  { id: 'cuid_a', name: 'Trần B', company: 'BetaCo', email: 'b@x.com', phone: '091', note: 'x', source: null, value: 0, stage: 'won', ownerId: null, createdAt: null, expectedClose: null },
  { id: 'cuid_c', name: 'Lê C', source: 'google', value: 200, stage: 'proposal', ownerId: 'u2', createdAt: '2026-02-10', expectedClose: '2026-05-01' },
];

test('projectLead yields ONLY the 7 allowlisted keys even with PII present', () => {
  const out = projectLead(rawLeads[0]);
  assert.deepEqual(Object.keys(out).sort(), [...LEAD_ALLOWLIST].sort());
  assert.equal(Object.keys(out).length, 7);
  // owner_assigned is a boolean derived from presence, never the id
  assert.equal(out.owner_assigned, true);
  assert.equal(projectLead(rawLeads[1]).owner_assigned, false);
  assert.equal(out.created_at, '2026-01-02');
  assert.equal(out.expected_close_at, '2026-03-01');
});

test('Date timestamp inputs are normalized and included in snapshot_id', () => {
  const base = [{
    id: 'date-lead', source: 'direct', value: 1, stage: 'new', ownerId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), expectedClose: null,
  }];
  const changed = [{ ...base[0], createdAt: new Date('2026-01-02T00:00:00.000Z') }];
  const a = buildSnapshot(base, { generatedAt: '2026-07-18T00:00:00Z' });
  const b = buildSnapshot(changed, { generatedAt: '2026-07-18T00:00:00Z' });

  assert.equal(a.leads[0].created_at, '2026-01-01T00:00:00.000Z');
  assert.equal(b.leads[0].created_at, '2026-01-02T00:00:00.000Z');
  assert.notEqual(a.snapshot_id, b.snapshot_id, 'timestamp fact changes must change the content hash');
});

test('current string timestamp facts are preserved and included in snapshot_id', () => {
  const a = buildSnapshot([rawLeads[0]], { generatedAt: '2026-07-18T00:00:00Z' });
  const b = buildSnapshot([{ ...rawLeads[0], createdAt: '2026-01-03' }], { generatedAt: '2026-07-18T00:00:00Z' });
  assert.equal(a.leads[0].created_at, '2026-01-02');
  assert.equal(b.leads[0].created_at, '2026-01-03');
  assert.notEqual(a.snapshot_id, b.snapshot_id);
});

test('full snapshot contains no PII keys anywhere in the tree', () => {
  const snap = buildSnapshot(rawLeads, { generatedAt: '2026-07-18T00:00:00Z' });
  const banned = ['name', 'company', 'email', 'phone', 'note', 'ownerId', 'owner_id', 'password', 'invoice'];
  const walk = node => {
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        assert.ok(!banned.includes(k), `banned key "${k}" found in output`);
        walk(v);
      }
    }
  };
  walk(snap);
});

test('response shape + funnel definition + quality block', () => {
  const snap = buildSnapshot(rawLeads, { generatedAt: '2026-07-18T00:00:00Z' });
  assert.deepEqual(Object.keys(snap), [
    'schema_version', 'source', 'snapshot_id', 'generated_at', 'funnel_definition', 'leads', 'quality',
  ]);
  assert.equal(snap.schema_version, '1.0');
  assert.deepEqual(snap.source, { system: 'egoric', tenant_key: 'egoric' });
  assert.deepEqual(snap.funnel_definition, funnelDefinition());
  assert.equal(snap.funnel_definition.historical_transitions_available, false);
  // leads sorted by external_id
  assert.deepEqual(snap.leads.map(l => l.external_id), ['cuid_a', 'cuid_b', 'cuid_c']);
  // quality: 1 missing source (cuid_a), 1 missing created_at (cuid_a)
  assert.equal(snap.quality.records, 3);
  assert.equal(snap.quality.missing_source, 1);
  assert.equal(snap.quality.missing_created_at, 1);
  assert.equal(snap.quality.client_attribution, 'unavailable');
});

test('snapshot_id is deterministic: same facts → same id', () => {
  const a = buildSnapshot(rawLeads, { generatedAt: '2026-07-18T00:00:00Z' });
  const b = buildSnapshot(rawLeads, { generatedAt: '2099-01-01T00:00:00Z' }); // different generated_at
  assert.equal(a.snapshot_id, b.snapshot_id, 'generated_at must NOT affect the id');
  assert.ok(a.snapshot_id.startsWith('sha256:'));
});

test('snapshot_id is order-independent: shuffled input → same id', () => {
  const a = buildSnapshot(rawLeads, { generatedAt: 't' });
  const shuffled = [rawLeads[2], rawLeads[0], rawLeads[1]];
  const b = buildSnapshot(shuffled, { generatedAt: 't' });
  assert.equal(a.snapshot_id, b.snapshot_id);
});

test('snapshot_id changes when one fact changes', () => {
  const a = buildSnapshot(rawLeads, { generatedAt: 't' });
  const mutated = rawLeads.map((l, i) => (i === 0 ? { ...l, stage: 'lost' } : l));
  const b = buildSnapshot(mutated, { generatedAt: 't' });
  assert.notEqual(a.snapshot_id, b.snapshot_id);
});

test('computeSnapshotId ignores key order in the facts object', () => {
  const facts1 = { schema_version: '1.0', source: { system: 'egoric', tenant_key: 'egoric' }, funnel_definition: funnelDefinition(), leads: [], quality: { records: 0, missing_source: 0, missing_created_at: 0, client_attribution: 'unavailable' } };
  const facts2 = { quality: facts1.quality, leads: [], funnel_definition: facts1.funnel_definition, source: facts1.source, schema_version: '1.0' };
  assert.equal(computeSnapshotId(facts1), computeSnapshotId(facts2));
});
