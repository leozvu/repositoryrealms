import crypto from 'node:crypto';
import { normalizeCeoRegistryEntityId } from './ceo-entity-registry.js';

export const CEO_ROLLOUT_VERSION = 1;
export const CEO_ROLLOUT_RING_ORDER = Object.freeze([
  'local_staging',
  'read_only',
  'ceo_sso',
  'messaging',
  'commands',
]);

export const CEO_ROLLOUT_RING_DEFINITIONS = Object.freeze({
  local_staging: Object.freeze({ capabilities: [], label: 'Local / staging adapters' }),
  read_only: Object.freeze({ capabilities: ['dashboard.read', 'deep_links.read'], label: 'Read-only pilot' }),
  ceo_sso: Object.freeze({ capabilities: ['dashboard.read', 'deep_links.read', 'sso.issue', 'federation.read'], label: 'CEO-only SSO' }),
  messaging: Object.freeze({ capabilities: ['dashboard.read', 'deep_links.read', 'sso.issue', 'federation.read', 'messaging.sync', 'messaging.send'], label: 'Cross-entity messaging' }),
  commands: Object.freeze({ capabilities: ['dashboard.read', 'deep_links.read', 'sso.issue', 'federation.read', 'messaging.sync', 'messaging.send', 'command.dispatch'], label: 'Allowlisted commands' }),
});

export const CEO_ROLLOUT_EVIDENCE_KINDS = Object.freeze([
  'backup',
  'restore_test',
  'canary',
  'reconciliation',
  'rollback',
  'security_review',
  'privacy_review',
  'maker_checker',
  'finance_review',
]);

const BASE_EVIDENCE = Object.freeze(['backup', 'restore_test', 'canary', 'reconciliation', 'rollback']);
const RING_EVIDENCE = Object.freeze({
  local_staging: BASE_EVIDENCE,
  read_only: BASE_EVIDENCE,
  ceo_sso: Object.freeze([...BASE_EVIDENCE, 'security_review']),
  messaging: Object.freeze([...BASE_EVIDENCE, 'security_review', 'privacy_review']),
  commands: Object.freeze([...BASE_EVIDENCE, 'security_review', 'privacy_review', 'maker_checker']),
});

const STATUS = new Set(['hold', 'active', 'paused']);
const ACTIONS = new Set(['activate', 'promote', 'pause', 'rollback']);
const SAFE_REFERENCE_PROTOCOLS = new Set(['https:', 'artifact:', 'vercel:']);
const MAX_EVIDENCE_LIFETIME_MS = 30 * 24 * 60 * 60_000;

export class CeoRolloutError extends Error {
  constructor(message, status = 400, code = 'ceo_rollout_invalid') {
    super(message);
    this.name = 'CeoRolloutError';
    this.status = status;
    this.code = code;
  }
}

function fail(message, status, code) {
  throw new CeoRolloutError(message, status, code);
}

function exactObject(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be an object.`, 400, 'ceo_rollout_payload_invalid');
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(`${field} contains unsupported fields.`, 400, 'ceo_rollout_payload_unknown_field');
}

function cleanText(value, field, min, max) {
  const normalized = String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  if (normalized.length < min || normalized.length > max) fail(`${field} is invalid.`, 400, `ceo_rollout_${field}_invalid`);
  return normalized;
}

export function normalizeCeoRolloutRing(value) {
  const ring = String(value || '').trim().toLowerCase();
  if (!CEO_ROLLOUT_RING_ORDER.includes(ring)) fail('Rollout ring is invalid.', 400, 'ceo_rollout_ring_invalid');
  return ring;
}

export function ceoRolloutRingIndex(value) {
  return CEO_ROLLOUT_RING_ORDER.indexOf(normalizeCeoRolloutRing(value));
}

export function nextCeoRolloutRing(value) {
  const index = ceoRolloutRingIndex(value);
  return CEO_ROLLOUT_RING_ORDER[index + 1] || null;
}

export function requiredCeoRolloutEvidence(entityId, ring) {
  entityId = normalizeCeoRegistryEntityId(entityId);
  ring = normalizeCeoRolloutRing(ring);
  const required = [...RING_EVIDENCE[ring]];
  if (entityId === 'egolive' && ring === 'commands') required.push('finance_review');
  return required;
}

function normalizeEvidenceReference(value) {
  const reference = cleanText(value, 'evidence_reference', 8, 300);
  if (/[?#]/.test(reference)) fail('Evidence references cannot contain query strings or fragments.', 400, 'ceo_rollout_evidence_reference_unsafe');
  let parsed;
  try { parsed = new URL(reference); } catch { fail('Evidence reference must be an approved absolute artifact URL.', 400, 'ceo_rollout_evidence_reference_invalid'); }
  if (!SAFE_REFERENCE_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
    fail('Evidence reference is not allowed.', 400, 'ceo_rollout_evidence_reference_unsafe');
  }
  return parsed.toString();
}

function normalizeChecksum(value) {
  const checksum = String(value || '').trim().toLowerCase().replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/.test(checksum)) fail('A SHA-256 evidence checksum is required.', 400, 'ceo_rollout_evidence_checksum_invalid');
  return `sha256:${checksum}`;
}

function normalizeTimestamp(value, field) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) fail(`${field} is invalid.`, 400, `ceo_rollout_${field}_invalid`);
  return date;
}

export function normalizeCeoRolloutEvidence(input = {}, { now = new Date() } = {}) {
  exactObject(input, ['ring', 'kind', 'reference', 'checksum', 'observedAt', 'expiresAt', 'expectedVersion'], 'evidence');
  const ring = normalizeCeoRolloutRing(input.ring);
  const kind = String(input.kind || '').trim().toLowerCase();
  if (!CEO_ROLLOUT_EVIDENCE_KINDS.includes(kind)) fail('Evidence kind is invalid.', 400, 'ceo_rollout_evidence_kind_invalid');
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) fail('Expected version is invalid.', 400, 'ceo_rollout_expected_version_invalid');
  const observedAt = normalizeTimestamp(input.observedAt, 'evidence_observed_at');
  const expiresAt = normalizeTimestamp(input.expiresAt, 'evidence_expires_at');
  if (observedAt > new Date(now.getTime() + 5 * 60_000) || expiresAt <= now || expiresAt <= observedAt || expiresAt > new Date(now.getTime() + MAX_EVIDENCE_LIFETIME_MS)) {
    fail('Evidence validity window is invalid.', 400, 'ceo_rollout_evidence_window_invalid');
  }
  return {
    ring,
    kind,
    reference: normalizeEvidenceReference(input.reference),
    checksum: normalizeChecksum(input.checksum),
    observedAt,
    expiresAt,
    expectedVersion,
  };
}

export function normalizeCeoRolloutTransition(input = {}, entityId) {
  exactObject(input, ['action', 'targetRing', 'expectedVersion', 'reason', 'confirmation'], 'transition');
  entityId = normalizeCeoRegistryEntityId(entityId);
  const action = String(input.action || '').trim().toLowerCase();
  if (!ACTIONS.has(action)) fail('Rollout action is invalid.', 400, 'ceo_rollout_action_invalid');
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) fail('Expected version is invalid.', 400, 'ceo_rollout_expected_version_invalid');
  return {
    action,
    targetRing: input.targetRing ? normalizeCeoRolloutRing(input.targetRing) : null,
    expectedVersion,
    reason: cleanText(input.reason, 'reason', 8, 240),
    confirmation: String(input.confirmation || '').trim(),
    entityId,
  };
}

export function ceoRolloutConfirmation(action, entityId, targetRing = null) {
  entityId = normalizeCeoRegistryEntityId(entityId);
  if (action === 'pause') return `PAUSE ${entityId}`;
  if (action === 'rollback') return `ROLLBACK ${entityId} TO ${normalizeCeoRolloutRing(targetRing)}`;
  if (action === 'promote') return `PROMOTE ${entityId} TO ${normalizeCeoRolloutRing(targetRing)}`;
  return `ACTIVATE ${entityId} ${normalizeCeoRolloutRing(targetRing)}`;
}

export function evidenceDigest(rows = []) {
  const material = rows
    .map((row) => `${row.kind}:${row.checksum}:${new Date(row.expiresAt).toISOString()}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(material).digest('hex');
}

export function evaluateCeoRolloutEvidence(entityId, ring, rows = [], { now = new Date(), transitionActorId = null } = {}) {
  const latest = new Map();
  for (const row of rows) {
    if (row.ring !== ring || new Date(row.expiresAt) <= now) continue;
    const current = latest.get(row.kind);
    if (!current || new Date(row.createdAt) > new Date(current.createdAt)) latest.set(row.kind, row);
  }
  const required = requiredCeoRolloutEvidence(entityId, ring);
  const missing = required.filter((kind) => !latest.has(kind));
  const independentKinds = ring === 'commands'
    ? ['maker_checker', ...(entityId === 'egolive' ? ['finance_review'] : [])]
    : [];
  const notIndependent = independentKinds.filter((kind) => transitionActorId && latest.get(kind)?.recordedById === transitionActorId);
  return {
    required,
    missing,
    notIndependent,
    complete: missing.length === 0 && notIndependent.length === 0,
    evidence: [...latest.values()],
  };
}

export function readCeoRolloutApproval(env = process.env, now = new Date()) {
  const decision = String(env.CEO_ROLLOUT_CEO0_DECISION || 'HOLD').trim().toUpperCase();
  const id = String(env.CEO_ROLLOUT_PRODUCTION_APPROVAL_ID || '').trim();
  const allowedEntities = String(env.CEO_ROLLOUT_ALLOWED_ENTITIES || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const maxRing = CEO_ROLLOUT_RING_ORDER.includes(String(env.CEO_ROLLOUT_MAX_RING || '').trim().toLowerCase())
    ? String(env.CEO_ROLLOUT_MAX_RING).trim().toLowerCase()
    : 'local_staging';
  const expiresAt = new Date(env.CEO_ROLLOUT_APPROVAL_EXPIRES_AT || '');
  const commandCanaryEntity = String(env.CEO_ROLLOUT_COMMAND_CANARY_ENTITY || '').trim().toLowerCase() || null;
  return {
    decision,
    id: /^[A-Za-z0-9][A-Za-z0-9._:-]{5,119}$/.test(id) ? id : null,
    allowedEntities,
    maxRing,
    expiresAt: Number.isNaN(expiresAt.getTime()) ? null : expiresAt,
    commandCanaryEntity,
    active: decision === 'GO' && Boolean(id) && allowedEntities.length > 0 && !Number.isNaN(expiresAt.getTime()) && expiresAt > now,
  };
}

export function assertCeoProductionRolloutApproval(entity, targetRing, approval, now = new Date()) {
  targetRing = normalizeCeoRolloutRing(targetRing);
  if (entity.environment !== 'production' || targetRing === 'local_staging') return;
  if (!approval?.active || approval.expiresAt <= now || !approval.allowedEntities.includes(entity.id) || ceoRolloutRingIndex(approval.maxRing) < ceoRolloutRingIndex(targetRing)) {
    fail('CEO-0 production approval is missing or does not cover this rollout ring.', 423, 'ceo_rollout_production_hold');
  }
  if (targetRing === 'commands' && approval.commandCanaryEntity !== entity.id) {
    fail('This entity is not the approved command canary.', 423, 'ceo_rollout_command_canary_hold');
  }
}

export async function assertCeoRolloutCapability(db, entityId, capability, { action = null, now = new Date() } = {}) {
  entityId = normalizeCeoRegistryEntityId(entityId);
  const requiredRing = CEO_ROLLOUT_RING_ORDER.find((ring) => CEO_ROLLOUT_RING_DEFINITIONS[ring].capabilities.includes(capability));
  if (!requiredRing) fail('Rollout capability is not recognized.', 500, 'ceo_rollout_capability_invalid');
  const state = await db.ceoRolloutState.findUnique({ where: { entityId } });
  if (!state || !STATUS.has(state.status)) fail('Rollout state is unavailable.', 503, 'ceo_rollout_state_unavailable');
  if (state.status !== 'active') fail('Entity rollout is not active.', 423, `ceo_rollout_${state.status}`);
  if (ceoRolloutRingIndex(state.currentRing) < ceoRolloutRingIndex(requiredRing)) {
    fail('Capability is outside the active rollout ring.', 423, 'ceo_rollout_capability_hold');
  }
  if (entityId === 'egolive' && action && /(?:payout|settlement)/i.test(action)) {
    fail('Egolive payout and settlement remain local.', 403, 'ceo_rollout_egolive_finance_local_only');
  }
  return { entityId, ring: state.currentRing, capability, recordVersion: state.recordVersion, checkedAt: now };
}

export function serializeCeoRolloutState(row) {
  return {
    entityId: row.entityId,
    currentRing: row.currentRing,
    status: row.status,
    recordVersion: row.recordVersion,
    lastTransitionAt: row.lastTransitionAt || null,
    lastReconciledAt: row.lastReconciledAt || null,
    lastRollbackAt: row.lastRollbackAt || null,
  };
}
