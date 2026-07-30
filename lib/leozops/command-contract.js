// Sprints 1E-1J — strict command-plane contracts.
// A reviewed proposal may prepare an intent, but confirmation and execution are
// separate capabilities with their own default-off authority boundary.

import crypto from 'node:crypto';
import { canonicalStringify } from './projector.js';

export const LEOZOPS_COMMAND_CONTRACT = 'leozops.command-intent';
export const LEOZOPS_COMMAND_CONFIRM_CONTRACT = 'leozops.command-confirmation';
export const LEOZOPS_RUNTIME_CONTRACT = 'leozops.runtime-control';
export const LEOZOPS_COMMAND_VERSION = 1;
export const LEOZOPS_COMMAND_MAX_BODY_BYTES = 8 * 1024;
export const LEOZOPS_COMMAND_TTL_MS = 15 * 60_000;
export const LEOZOPS_RUNTIME_ID = 'global';

export const LEOZOPS_SOURCE_VALUES = Object.freeze([
  'facebook', 'tiktok', 'zalo', 'website', 'referral', 'partner', 'webinar', 'youtube', 'seo', 'other',
]);

export const LEOZOPS_COMMAND_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: 'lead.followup.create',
    label: 'Lên lịch follow-up',
    resource: 'activities',
    risk: 'R2',
    repositoryAction: 'lead.followup.create',
    proposalActionTypes: Object.freeze(['review_aging_leads']),
    envFlag: 'LEOZOPS_CAP_FOLLOWUP_ENABLED',
    mutation: 'additive',
    reversible: false,
    confirmation: 'explicit_each_time',
  }),
  Object.freeze({
    id: 'lead.expected_close.update',
    label: 'Cập nhật ngày dự kiến chốt',
    resource: 'leads',
    risk: 'R2',
    repositoryAction: 'lead.expected_close.update',
    proposalActionTypes: Object.freeze(['review_expected_close', 'complete_expected_close']),
    envFlag: 'LEOZOPS_CAP_EXPECTED_CLOSE_ENABLED',
    mutation: 'compare_and_swap',
    reversible: true,
    confirmation: 'explicit_each_time',
  }),
  Object.freeze({
    id: 'lead.source.update',
    label: 'Bổ sung nguồn Lead',
    resource: 'leads',
    risk: 'R2',
    repositoryAction: 'lead.source.update',
    proposalActionTypes: Object.freeze(['complete_lead_source']),
    envFlag: 'LEOZOPS_CAP_SOURCE_ENABLED',
    mutation: 'compare_and_swap',
    reversible: true,
    confirmation: 'explicit_each_time',
  }),
  Object.freeze({
    id: 'lead.transition',
    label: 'Chuyển trạng thái Lead',
    resource: 'leads',
    risk: 'R2',
    repositoryAction: 'lead.transition',
    proposalActionTypes: Object.freeze([]),
    envFlag: 'LEOZOPS_CAP_LEAD_TRANSITION_ENABLED',
    mutation: 'compare_and_swap',
    reversible: false,
    confirmation: 'explicit_each_time',
  }),
]);

export const LEOZOPS_UNSUPPORTED_PROPOSAL_ACTIONS = Object.freeze({
  review_lead_assignment: 'No solo-safe owner assignment capability is registered.',
  review_funnel_stage: 'Unknown stages need a human data repair before the canonical transition graph applies.',
  review_funnel_sync: 'No external CRM synchronization executor is registered.',
});

const CAPABILITY_BY_ID = new Map(LEOZOPS_COMMAND_CAPABILITIES.map(capability => [capability.id, capability]));
const SAFE_ID = /^[a-zA-Z0-9:_-]{1,160}$/;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9:_-]{16,160}$/;
const TOKEN = /^[a-zA-Z0-9_-]{24,160}$/;
const FOLLOWUP_KINDS = new Set(['call', 'meeting', 'email', 'note']);
const LEAD_STAGES = new Set(['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost']);

export class LeozOpsCommandError extends Error {
  constructor(message, status = 400, code = 'leozops_command_invalid', headers = {}) {
    super(message);
    this.name = 'LeozOpsCommandError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function fail(message, status, code, headers) {
  throw new LeozOpsCommandError(message, status, code, headers);
}

function exactObject(value, allowed, field = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object.`, 400, 'leozops_command_body_invalid');
  }
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    fail(`${field} contains unsupported fields.`, 400, 'leozops_command_unknown_field');
  }
}

export function safeCommandId(value, field = 'id') {
  const normalized = String(value || '').trim();
  if (!SAFE_ID.test(normalized)) fail(`${field} is invalid.`, 400, `leozops_command_${field}_invalid`);
  return normalized;
}

export function normalizeCommandIdempotencyKey(value) {
  const normalized = String(value || '').trim();
  if (!IDEMPOTENCY_KEY.test(normalized)) {
    fail('Idempotency-Key is required and invalid.', 400, 'leozops_command_idempotency_invalid');
  }
  return normalized;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function commandFactsHash(value) {
  return sha256(canonicalStringify(value));
}

function validDay(value) {
  const day = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

function safeTitle(value) {
  const title = String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 160) fail('Follow-up title must contain 1-160 characters.', 400, 'leozops_command_title_invalid');
  if (/@|https?:\/\/|(?:\+?\d[\d .()-]{7,}\d)/i.test(title)) {
    fail('Follow-up title must not contain contact details or links.', 400, 'leozops_command_title_sensitive');
  }
  return title;
}

function normalizeParameters(capability, value) {
  if (capability.id === 'lead.followup.create') {
    exactObject(value, ['kind', 'title', 'date'], 'parameters');
    const kind = String(value.kind || '').trim().toLowerCase();
    if (!FOLLOWUP_KINDS.has(kind)) fail('Follow-up kind is invalid.', 400, 'leozops_command_followup_kind_invalid');
    const date = validDay(value.date);
    if (!date) fail('Follow-up date is invalid.', 400, 'leozops_command_followup_date_invalid');
    return { kind, title: safeTitle(value.title), date };
  }
  if (capability.id === 'lead.expected_close.update') {
    exactObject(value, ['close_at'], 'parameters');
    const closeAt = validDay(value.close_at);
    if (!closeAt) fail('Expected-close date is invalid.', 400, 'leozops_command_expected_close_invalid');
    return { closeAt };
  }
  if (capability.id === 'lead.source.update') {
    exactObject(value, ['source'], 'parameters');
    const source = String(value.source || '').trim().toLowerCase();
    if (!LEOZOPS_SOURCE_VALUES.includes(source)) fail('Lead source is outside the allowlist.', 400, 'leozops_command_source_invalid');
    return { source };
  }
  exactObject(value, ['next_stage'], 'parameters');
  const nextStage = String(value.next_stage || '').trim().toLowerCase();
  if (!LEAD_STAGES.has(nextStage)) fail('Lead stage is invalid.', 400, 'leozops_command_stage_invalid');
  return { nextStage };
}

export function capabilityById(value) {
  return CAPABILITY_BY_ID.get(String(value || '').trim()) || null;
}

export function capabilityProjection(capability, env = {}) {
  return {
    id: capability.id,
    label: capability.label,
    resource: capability.resource,
    risk: capability.risk,
    enabled: env[capability.envFlag] === 'true',
    mutation: capability.mutation,
    reversible: capability.reversible,
    confirmation: capability.confirmation,
    proposal_action_types: [...capability.proposalActionTypes],
  };
}

export function normalizeCommandIntent(input) {
  exactObject(input, ['contract', 'version', 'proposal_id', 'capability', 'target_ref', 'parameters']);
  if (input.contract !== LEOZOPS_COMMAND_CONTRACT || input.version !== LEOZOPS_COMMAND_VERSION) {
    fail('Command contract version is unsupported.', 409, 'leozops_command_contract_unsupported');
  }
  const capability = capabilityById(input.capability);
  if (!capability) fail('Capability is not registered.', 400, 'leozops_command_capability_unsupported');
  return {
    proposalId: safeCommandId(input.proposal_id, 'proposal_id'),
    capability,
    targetRef: safeCommandId(input.target_ref, 'target_ref'),
    parameters: normalizeParameters(capability, input.parameters),
  };
}

export function normalizeCommandConfirmation(input) {
  exactObject(input, ['contract', 'version', 'intent_id', 'confirmation_token', 'confirm']);
  if (input.contract !== LEOZOPS_COMMAND_CONFIRM_CONTRACT || input.version !== LEOZOPS_COMMAND_VERSION) {
    fail('Confirmation contract version is unsupported.', 409, 'leozops_command_confirmation_contract_unsupported');
  }
  const token = String(input.confirmation_token || '').trim();
  if (!TOKEN.test(token) || input.confirm !== true) {
    fail('Explicit command confirmation is required.', 400, 'leozops_command_confirmation_invalid');
  }
  return { intentId: safeCommandId(input.intent_id, 'intent_id'), token };
}

export function normalizeRuntimeCommand(input) {
  exactObject(input, ['contract', 'version', 'action', 'expected_version', 'daily_action_limit']);
  if (input.contract !== LEOZOPS_RUNTIME_CONTRACT || input.version !== LEOZOPS_COMMAND_VERSION) {
    fail('Runtime contract version is unsupported.', 409, 'leozops_runtime_contract_unsupported');
  }
  const action = String(input.action || '').trim();
  if (!['activate', 'kill', 'reset_circuit'].includes(action)) fail('Runtime action is invalid.', 400, 'leozops_runtime_action_invalid');
  const expectedVersion = Number(input.expected_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) fail('Runtime version is invalid.', 400, 'leozops_runtime_version_invalid');
  let dailyActionLimit;
  if (input.daily_action_limit !== undefined) {
    dailyActionLimit = Number(input.daily_action_limit);
    if (!Number.isInteger(dailyActionLimit) || dailyActionLimit < 1 || dailyActionLimit > 100) {
      fail('Daily action limit must be between 1 and 100.', 400, 'leozops_runtime_limit_invalid');
    }
  }
  return { action, expectedVersion, dailyActionLimit };
}

export function parseStoredJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function projectRuntime(row, env = {}) {
  const present = Boolean(row);
  const executionFlag = env.LEOZOPS_EXECUTION_ENABLED === 'true';
  const killSwitchActive = present ? row.killSwitchActive !== false : true;
  const executionEnabled = present && row.executionEnabled === true && executionFlag && !killSwitchActive;
  return {
    configured: present,
    command_plane_enabled: env.LEOZOPS_COMMAND_ENABLED === 'true',
    deployment_execution_enabled: executionFlag,
    execution_enabled: executionEnabled,
    kill_switch_active: killSwitchActive,
    daily_action_limit: present ? row.dailyActionLimit : 0,
    circuit_state: present ? row.circuitState : 'closed',
    circuit_retry_at: row?.circuitRetryAt ? new Date(row.circuitRetryAt).toISOString() : null,
    record_version: present ? row.recordVersion : 0,
  };
}
