// Sprint 1B — deterministic, de-identified Lead Operations Brief.
//
// This module turns the Sprint 1A allowlisted snapshot into aggregate attention
// signals. It never reads arbitrary entity fields, never emits PII, never
// executes an action and never invents metrics the source cannot support.

import crypto from 'crypto';
import { buildSnapshot, canonicalStringify, funnelDefinition } from './projector.js';

export const BRIEF_SCHEMA_VERSION = '1.0';
export const BRIEF_POLICY_ID = 'egoric_lead_ops_brief_v1';

const DAY_MS = 86_400_000;
const STAGE_ORDER = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
const ACTIVE_STAGES = new Set(funnelDefinition().active_stages);
const TERMINAL_STAGES = new Set(funnelDefinition().terminal_outcomes);
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export const BRIEF_POLICY = Object.freeze({
  id: BRIEF_POLICY_ID,
  aging_days_by_stage: Object.freeze({ new: 3, contacted: 7, proposal: 14, negotiation: 14 }),
  expected_close_required_stages: Object.freeze(['proposal', 'negotiation']),
  sample_reference_limit: 25,
});

const isBlank = value => value === null || value === undefined || value === '';

function dateFact(value) {
  if (isBlank(value)) return { state: 'missing', ms: null };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { state: 'invalid', ms: null }
      : { state: 'valid', ms: value.getTime() };
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    return { state: 'invalid', ms: null };
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return { state: 'invalid', ms: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(ms).toISOString().slice(0, 10) !== value) {
    return { state: 'invalid', ms: null };
  }
  return { state: 'valid', ms };
}

function numericValue(lead) {
  return typeof lead.estimated_value === 'number' && Number.isFinite(lead.estimated_value)
    ? lead.estimated_value
    : 0;
}

function sumValue(leads) {
  return leads.reduce((sum, lead) => sum + numericValue(lead), 0);
}

function evidenceFor(leads) {
  const refs = leads.map(lead => lead.external_id).sort();
  const sample = refs.slice(0, BRIEF_POLICY.sample_reference_limit);
  return {
    lead_count: leads.length,
    estimated_value_total: sumValue(leads),
    sample_external_ids: sample,
    remaining_count: Math.max(0, refs.length - sample.length),
  };
}

function signalOf({ type, severity, title, summary, leads, actionType, asOfDate }) {
  const evidence = evidenceFor(leads);
  const signal_id = 'sha256:' + crypto
    .createHash('sha256')
    .update(canonicalStringify({ type, as_of_date: asOfDate, evidence }))
    .digest('hex');

  return {
    signal_id,
    type,
    severity,
    title,
    summary,
    evidence,
    proposal: {
      mode: 'proposal_only',
      action_type: actionType,
      requires_human_review: true,
      executable: false,
    },
  };
}

function normalizedAsOf(asOf, generatedAt) {
  const candidate = asOf ?? (typeof generatedAt === 'string' ? generatedAt.slice(0, 10) : null);
  if (typeof candidate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    throw new TypeError('asOf must be YYYY-MM-DD');
  }
  const ms = Date.parse(candidate + 'T00:00:00.000Z');
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== candidate) {
    throw new TypeError('invalid asOf date');
  }
  return { date: candidate, ms };
}

function qualityBlock(snapshot, leads) {
  return {
    ...snapshot.quality,
    invalid_created_at: leads.filter(lead => dateFact(lead.created_at).state === 'invalid').length,
    invalid_expected_close_at: leads.filter(lead => dateFact(lead.expected_close_at).state === 'invalid').length,
    invalid_estimated_value: leads.filter(lead => !(
      typeof lead.estimated_value === 'number' && Number.isFinite(lead.estimated_value)
    )).length,
    unknown_stage: leads.filter(lead => !STAGE_ORDER.includes(lead.stage)).length,
  };
}

function metricBlock(leads) {
  const active = leads.filter(lead => ACTIVE_STAGES.has(lead.stage));
  const terminal = leads.filter(lead => TERMINAL_STAGES.has(lead.stage));
  const assignedActive = active.filter(lead => lead.owner_assigned).length;

  return {
    total_leads: leads.length,
    active_leads: active.length,
    terminal_leads: terminal.length,
    unknown_stage_leads: leads.length - active.length - terminal.length,
    estimated_value_total: sumValue(leads),
    active_estimated_value: sumValue(active),
    won_estimated_value: sumValue(leads.filter(lead => lead.stage === 'won')),
    lost_estimated_value: sumValue(leads.filter(lead => lead.stage === 'lost')),
    value_unit: 'source_native_unlabeled',
    owner_coverage: {
      assigned_active: assignedActive,
      unassigned_active: active.length - assignedActive,
      ratio: active.length ? assignedActive / active.length : null,
    },
    stage_counts: [
      ...STAGE_ORDER.map(stage => {
        const rows = leads.filter(lead => lead.stage === stage);
        return { stage, count: rows.length, estimated_value_total: sumValue(rows) };
      }),
      {
        stage: 'unknown',
        count: leads.filter(lead => !STAGE_ORDER.includes(lead.stage)).length,
        estimated_value_total: sumValue(leads.filter(lead => !STAGE_ORDER.includes(lead.stage))),
      },
    ],
  };
}

function buildSignals(leads, asOf) {
  const active = leads.filter(lead => ACTIVE_STAGES.has(lead.stage));
  const signals = [];
  const add = config => {
    if (config.leads.length) signals.push(signalOf({ ...config, asOfDate: asOf.date }));
  };

  add({
    type: 'unassigned_active_leads',
    severity: 'high',
    title: 'Active leads need an owner',
    summary: 'Assignment is missing on open funnel records. Review ownership before follow-up work is proposed.',
    leads: active.filter(lead => !lead.owner_assigned),
    actionType: 'review_lead_assignment',
  });

  add({
    type: 'overdue_expected_close',
    severity: 'high',
    title: 'Expected close dates are overdue',
    summary: 'Open leads have expected-close dates before the brief date. Validate the date or funnel state.',
    leads: active.filter(lead => {
      const fact = dateFact(lead.expected_close_at);
      return fact.state === 'valid' && fact.ms < asOf.ms;
    }),
    actionType: 'review_expected_close',
  });

  const closeRequired = new Set(BRIEF_POLICY.expected_close_required_stages);
  add({
    type: 'late_stage_missing_close',
    severity: 'medium',
    title: 'Late-stage leads need a close date',
    summary: 'Proposal or negotiation records are missing a usable expected-close date.',
    leads: active.filter(lead => closeRequired.has(lead.stage) && dateFact(lead.expected_close_at).state !== 'valid'),
    actionType: 'complete_expected_close',
  });

  add({
    type: 'aging_active_leads',
    severity: 'medium',
    title: 'Active leads exceed the age policy',
    summary: 'Creation age exceeds the stage policy. Last-activity history is unavailable, so human review is required.',
    leads: active.filter(lead => {
      const created = dateFact(lead.created_at);
      if (created.state !== 'valid') return false;
      const ageDays = Math.max(0, Math.floor((asOf.ms - created.ms) / DAY_MS));
      return ageDays > BRIEF_POLICY.aging_days_by_stage[lead.stage];
    }),
    actionType: 'review_aging_leads',
  });

  add({
    type: 'missing_lead_source',
    severity: 'low',
    title: 'Lead attribution needs cleanup',
    summary: 'Source is missing, so channel-level analysis would be incomplete.',
    leads: leads.filter(lead => isBlank(lead.source)),
    actionType: 'complete_lead_source',
  });

  add({
    type: 'unknown_funnel_stage',
    severity: 'high',
    title: 'Lead stage is outside the contract',
    summary: 'One or more records use a stage that is not part of egoric_sales_v1.',
    leads: leads.filter(lead => !STAGE_ORDER.includes(lead.stage)),
    actionType: 'review_funnel_stage',
  });

  if (!active.length) {
    signals.push(signalOf({
      type: 'no_active_leads',
      severity: 'info',
      title: 'No active leads in the current snapshot',
      summary: 'Confirm that the funnel is intentionally empty and that source synchronization is current.',
      leads: [],
      actionType: 'review_funnel_sync',
      asOfDate: asOf.date,
    }));
  }

  return signals.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.type.localeCompare(b.type));
}

function attentionBlock(signals) {
  return {
    total: signals.length,
    critical: signals.filter(signal => signal.severity === 'critical').length,
    high: signals.filter(signal => signal.severity === 'high').length,
    medium: signals.filter(signal => signal.severity === 'medium').length,
    low: signals.filter(signal => signal.severity === 'low').length,
    info: signals.filter(signal => signal.severity === 'info').length,
  };
}

export function computeBriefId(facts) {
  return 'sha256:' + crypto.createHash('sha256').update(canonicalStringify(facts)).digest('hex');
}

export function buildLeadBrief(rawLeads, { generatedAt, asOf } = {}) {
  const generated_at = generatedAt ?? null;
  const asOfFact = normalizedAsOf(asOf, generated_at);
  const snapshot = buildSnapshot(rawLeads, { generatedAt: generated_at });
  const leads = snapshot.leads;
  const source = snapshot.source;
  const source_snapshot_id = snapshot.snapshot_id;
  const as_of_date = asOfFact.date;
  const policy = {
    id: BRIEF_POLICY.id,
    aging_days_by_stage: { ...BRIEF_POLICY.aging_days_by_stage },
    expected_close_required_stages: [...BRIEF_POLICY.expected_close_required_stages],
    sample_reference_limit: BRIEF_POLICY.sample_reference_limit,
  };
  const funnel_definition = funnelDefinition();
  const metrics = metricBlock(leads);
  const signals = buildSignals(leads, asOfFact);
  const attention = attentionBlock(signals);
  const quality = qualityBlock(snapshot, leads);
  const limitations = {
    historical_transitions_available: false,
    conversion_rate: null,
    stage_velocity: null,
    last_activity_available: false,
    client_attribution: 'unavailable',
    executable_actions: false,
  };

  const facts = {
    schema_version: BRIEF_SCHEMA_VERSION,
    source,
    source_snapshot_id,
    as_of_date,
    policy,
    funnel_definition,
    metrics,
    attention,
    signals,
    quality,
    limitations,
  };
  const brief_id = computeBriefId(facts);

  return {
    schema_version: BRIEF_SCHEMA_VERSION,
    source,
    brief_id,
    source_snapshot_id,
    generated_at,
    as_of_date,
    policy,
    funnel_definition,
    metrics,
    attention,
    signals,
    quality,
    limitations,
  };
}
