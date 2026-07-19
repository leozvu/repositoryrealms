// Sprint 1A — LeozOps↔Egoric integration: contract/projector `egoric_sales_v1`.
//
// Pure module (no HTTP, no Prisma). Turns raw Lead rows into a DE-IDENTIFIED
// snapshot payload for the read-only LeozOps integration.
//
// PII SAFETY (load-bearing): we PROJECT TO a fixed 7-field allowlist by reading
// named fields off each lead — we never spread/filter FROM the entity object, so
// a new PII column on Lead can never leak here by accident. Prohibited forever:
// name, company, email, phone, note, ownerId (identity), invoice/employee data.
//
// STAGE VOCABULARY: the repo's native Lead.stage values are exactly
//   ['new','contacted','proposal','negotiation','won','lost']
// (see lib/format.js LEAD_STAGES and lib/importable.js). They already match the
// funnel definition below one-to-one, so NO remapping is invented — native values
// are preserved verbatim. active_stages = the four open stages, terminal_outcomes
// = ['won','lost']. If the native vocabulary ever diverges, remap here and update
// this docstring rather than inventing stages downstream.

import crypto from 'crypto';

export const SCHEMA_VERSION = '1.0';

// The ONLY keys that may appear per lead in the output.
export const LEAD_ALLOWLIST = [
  'external_id',
  'stage',
  'source',
  'estimated_value',
  'created_at',
  'expected_close_at',
  'owner_assigned',
];

// Project a raw Lead onto the allowlist. Build from named fields ONLY — never
// spread the entity — so PII columns cannot ride along.
export function projectLead(lead) {
  return {
    external_id: lead.id,
    stage: lead.stage,
    source: lead.source ?? null,
    estimated_value: lead.value ?? null,
    created_at: lead.createdAt ?? null,
    // owner_assigned is a BOOLEAN derived from presence — never the owner id/name.
    expected_close_at: lead.expectedClose ?? null,
    owner_assigned: Boolean(lead.ownerId),
  };
}

export function funnelDefinition() {
  return {
    id: 'egoric_sales_v1',
    active_stages: ['new', 'contacted', 'proposal', 'negotiation'],
    terminal_outcomes: ['won', 'lost'],
    historical_transitions_available: false,
  };
}

const isBlank = v => v === null || v === undefined || v === '';

function qualityBlock(leads) {
  return {
    records: leads.length,
    missing_source: leads.filter(l => isBlank(l.source)).length,
    missing_created_at: leads.filter(l => isBlank(l.created_at)).length,
    client_attribution: 'unavailable',
  };
}

// Canonical serialization: deterministic key order at every depth (arrays keep
// their order — callers must pre-sort leads). Same facts → identical string.
export function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
}

// snapshot_id = sha256 over the canonical form of the FACTS — everything except
// generated_at. Shuffled input or reordered keys → same id; one changed fact →
// different id.
export function computeSnapshotId({ schema_version, source, funnel_definition, leads, quality }) {
  const canonical = canonicalStringify({ schema_version, source, funnel_definition, leads, quality });
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

// Build the full snapshot payload from raw Lead rows.
// generatedAt is injected (ISO string) and is EXCLUDED from the snapshot_id.
export function buildSnapshot(rawLeads, { generatedAt } = {}) {
  const leads = (rawLeads || [])
    .map(projectLead)
    .sort((a, b) => (a.external_id < b.external_id ? -1 : a.external_id > b.external_id ? 1 : 0));

  const schema_version = SCHEMA_VERSION;
  const source = { system: 'egoric', tenant_key: 'egoric' };
  const funnel_definition = funnelDefinition();
  const quality = qualityBlock(leads);
  const snapshot_id = computeSnapshotId({ schema_version, source, funnel_definition, leads, quality });

  // Top-level shape / order per the contract.
  return {
    schema_version,
    source,
    snapshot_id,
    generated_at: generatedAt ?? null,
    funnel_definition,
    leads,
    quality,
  };
}
