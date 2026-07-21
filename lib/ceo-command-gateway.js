import { createHash } from 'node:crypto';

export const CEO_COMMAND_GATEWAY_VERSION = 1;
export const CEO_COMMAND_CONTRACT = 'repositoryrealms.ceo.command';
export const CEO_COMMAND_RECEIPT_CONTRACT = 'repositoryrealms.ceo.command-receipt';
export const CEO_COMMAND_FETCH_TIMEOUT_MS = 5_000;
export const CEO_COMMAND_MAX_BODY_BYTES = 16 * 1024;

export const CEO_COMMAND_DEFINITIONS = Object.freeze([
  Object.freeze({
    action: 'task.create',
    scope: 'command.task.create',
    capability: 'delivery',
    resource: 'tasks',
    label: 'Create task',
  }),
  Object.freeze({
    action: 'status.request',
    scope: 'command.status.request',
    capability: 'delivery',
    resource: 'tasks',
    label: 'Request status',
  }),
  Object.freeze({
    action: 'announcement.send',
    scope: 'command.announcement.send',
    capability: 'people',
    resource: 'notifications',
    label: 'Send announcement',
  }),
  Object.freeze({
    action: 'approval.request',
    scope: 'command.approval.request',
    capability: 'people',
    resource: 'approvals',
    label: 'Submit approval request',
  }),
]);

export const CEO_COMMAND_ACTIONS = Object.freeze(CEO_COMMAND_DEFINITIONS.map((item) => item.action));
export const CEO_COMMAND_SCOPES = Object.freeze(CEO_COMMAND_DEFINITIONS.map((item) => item.scope));
export const CEO_COMMAND_DELIVERY_STATUSES = Object.freeze([
  'dispatching',
  'delivered',
  'pending_confirmation',
  'rejected',
  'failed',
]);

const DEFINITION_BY_ACTION = new Map(CEO_COMMAND_DEFINITIONS.map((item) => [item.action, item]));
const SAFE_ID = /^[a-zA-Z0-9:_-]{3,160}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE = new Set(['DIRECTOR', 'PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD']);
const PRIORITY = new Set(['low', 'medium', 'high', 'urgent']);

export class CeoCommandError extends Error {
  constructor(message, status = 400, code = 'ceo_command_invalid') {
    super(message);
    this.name = 'CeoCommandError';
    this.status = status;
    this.code = code;
  }
}

function fail(message, status, code) {
  throw new CeoCommandError(message, status, code);
}

function exactObject(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object.`, 400, 'ceo_command_payload_invalid');
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(`${field} contains unsupported fields.`, 400, 'ceo_command_payload_unknown_field');
}

function text(value, field, min, max, { optional = false, multiline = false } = {}) {
  let normalized = String(value ?? '');
  normalized = normalized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  normalized = multiline ? normalized.replace(/\r\n?/g, '\n').trim() : normalized.replace(/\s+/g, ' ').trim();
  if (optional && !normalized) return null;
  if (normalized.length < min || normalized.length > max) {
    fail(`${field} is invalid.`, 400, `ceo_command_${field}_invalid`);
  }
  return normalized;
}

function token(value, field, pattern = SAFE_ID) {
  const normalized = String(value || '').trim();
  if (!pattern.test(normalized)) fail(`${field} is invalid.`, 400, `ceo_command_${field}_invalid`);
  return normalized;
}

function email(value, field, optional = false) {
  const normalized = String(value || '').trim().toLowerCase();
  if (optional && !normalized) return null;
  if (normalized.length > 160 || !EMAIL.test(normalized)) {
    fail(`${field} is invalid.`, 400, `ceo_command_${field}_invalid`);
  }
  return normalized;
}

function day(value, optional = true) {
  const normalized = String(value || '').trim();
  if (optional && !normalized) return null;
  if (!ISO_DAY.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00.000Z`))) {
    fail('dueDate is invalid.', 400, 'ceo_command_due_date_invalid');
  }
  return normalized;
}

function enumValue(value, allowed, field, fallback = null) {
  const normalized = String(value || fallback || '').trim();
  if (!allowed.has(normalized)) fail(`${field} is invalid.`, 400, `ceo_command_${field}_invalid`);
  return normalized;
}

function finite(value, field, min, max, fallback = 0) {
  const number = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    fail(`${field} is invalid.`, 400, `ceo_command_${field}_invalid`);
  }
  return Math.round(number * 100) / 100;
}

function normalizeTaskCreate(payload) {
  exactObject(payload, ['title', 'note', 'assigneeEmail', 'projectId', 'dueDate', 'priority', 'estHours'], 'payload');
  return {
    title: text(payload.title, 'title', 3, 160),
    note: text(payload.note, 'note', 0, 1_000, { optional: true, multiline: true }),
    assigneeEmail: email(payload.assigneeEmail, 'assignee_email', true),
    projectId: payload.projectId ? token(payload.projectId, 'project_id') : null,
    dueDate: day(payload.dueDate),
    priority: enumValue(payload.priority, PRIORITY, 'priority', 'medium'),
    estHours: finite(payload.estHours, 'estimated_hours', 0, 1_000),
  };
}

function normalizeStatusRequest(payload) {
  exactObject(payload, ['topic', 'message', 'targetEmail', 'dueDate', 'priority'], 'payload');
  return {
    topic: text(payload.topic, 'topic', 3, 160),
    message: text(payload.message, 'message', 1, 800, { multiline: true }),
    targetEmail: email(payload.targetEmail, 'target_email'),
    dueDate: day(payload.dueDate),
    priority: enumValue(payload.priority, new Set(['medium', 'high', 'urgent']), 'priority', 'medium'),
  };
}

function normalizeAnnouncement(payload) {
  exactObject(payload, ['title', 'message', 'audience', 'role'], 'payload');
  const audience = enumValue(payload.audience, new Set(['all', 'role']), 'audience', 'all');
  const role = audience === 'role' ? enumValue(payload.role, ROLE, 'role') : null;
  const title = text(payload.title, 'title', 3, 70);
  const message = text(payload.message, 'message', 1, 240, { multiline: true });
  return {
    title,
    message,
    audience,
    role,
  };
}

function normalizeApproval(payload) {
  exactObject(payload, ['title', 'note', 'approverRole'], 'payload');
  return {
    title: text(payload.title, 'title', 3, 160),
    note: text(payload.note, 'note', 1, 1_000, { multiline: true }),
    approverRole: enumValue(payload.approverRole, ROLE, 'approver_role'),
  };
}

export function ceoCommandDefinition(action) {
  return DEFINITION_BY_ACTION.get(String(action || '').trim()) || null;
}

export function normalizeCeoCommandCorrelationId(value) {
  return token(value, 'correlation_id');
}

export function normalizeCeoCommandPayload(action, payload) {
  if (action === 'task.create') return normalizeTaskCreate(payload);
  if (action === 'status.request') return normalizeStatusRequest(payload);
  if (action === 'announcement.send') return normalizeAnnouncement(payload);
  if (action === 'approval.request') return normalizeApproval(payload);
  fail('Command is not allowlisted.', 400, 'ceo_command_unsupported');
}

export function stableCeoCommandJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCeoCommandJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCeoCommandJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashCeoCommandPayload(payload) {
  return createHash('sha256').update(stableCeoCommandJson(payload)).digest('hex');
}

export function normalizeCeoCommandEnvelope(input = {}) {
  exactObject(input, ['contract', 'version', 'targetEntityId', 'actorSubject', 'action', 'scope', 'idempotencyKey', 'correlationId', 'payload'], 'command');
  if (input.contract !== CEO_COMMAND_CONTRACT || Number(input.version) !== CEO_COMMAND_GATEWAY_VERSION) {
    fail('Command contract version is unsupported.', 409, 'ceo_command_contract_unsupported');
  }
  const action = String(input.action || '').trim();
  const definition = ceoCommandDefinition(action);
  if (!definition) fail('Command is not allowlisted.', 400, 'ceo_command_unsupported');
  const scope = String(input.scope || '').trim().toLowerCase();
  if (scope !== definition.scope) fail('Command scope does not match the action.', 403, 'ceo_command_scope_mismatch');
  const payload = normalizeCeoCommandPayload(action, input.payload);
  return {
    contract: CEO_COMMAND_CONTRACT,
    version: CEO_COMMAND_GATEWAY_VERSION,
    targetEntityId: token(input.targetEntityId, 'target_entity', /^[a-z0-9][a-z0-9-]{1,47}$/),
    actorSubject: token(input.actorSubject, 'actor_subject'),
    action,
    scope,
    idempotencyKey: token(input.idempotencyKey, 'idempotency_key'),
    correlationId: normalizeCeoCommandCorrelationId(input.correlationId),
    payload,
    payloadHash: hashCeoCommandPayload(payload),
    definition,
  };
}

function iso(value, field) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) fail(`${field} is invalid.`, 502, 'ceo_command_receipt_invalid');
  return date.toISOString();
}

export function sanitizeCeoCommandReceipt(value, expected = {}) {
  if (!value || value.contract !== CEO_COMMAND_RECEIPT_CONTRACT || Number(value.version) !== CEO_COMMAND_GATEWAY_VERSION) {
    fail('Target returned an unsupported receipt.', 502, 'ceo_command_receipt_invalid');
  }
  const receipt = value.receipt;
  exactObject(receipt, ['id', 'targetEntityId', 'actorSubject', 'action', 'scope', 'correlationId', 'resource', 'recordId', 'resultCount', 'committedAt', 'replayed'], 'receipt');
  const sanitized = {
    id: token(receipt.id, 'receipt_id'),
    targetEntityId: token(receipt.targetEntityId, 'target_entity', /^[a-z0-9][a-z0-9-]{1,47}$/),
    actorSubject: token(receipt.actorSubject, 'actor_subject'),
    action: String(receipt.action || ''),
    scope: String(receipt.scope || ''),
    correlationId: token(receipt.correlationId, 'correlation_id'),
    resource: token(receipt.resource, 'resource', /^[a-z][a-z0-9_-]{1,47}$/),
    recordId: receipt.recordId ? token(receipt.recordId, 'record_id') : null,
    resultCount: Math.max(0, Math.min(10_000, Math.round(Number(receipt.resultCount || 0)))),
    committedAt: iso(receipt.committedAt, 'committed_at'),
    replayed: receipt.replayed === true,
  };
  const definition = ceoCommandDefinition(sanitized.action);
  if (
    !definition || sanitized.scope !== definition.scope || sanitized.resource !== definition.resource
    || (expected.targetEntityId && sanitized.targetEntityId !== expected.targetEntityId)
    || (expected.actorSubject && sanitized.actorSubject !== expected.actorSubject)
    || (expected.action && sanitized.action !== expected.action)
    || (expected.correlationId && sanitized.correlationId !== expected.correlationId)
  ) {
    fail('Target receipt does not match the dispatched command.', 502, 'ceo_command_receipt_mismatch');
  }
  if (
    value.repository?.name !== 'RepositoryRealms'
    || value.repository?.receiptId !== sanitized.id
    || value.repository?.invariants?.authorization !== 'enforced'
    || value.repository?.invariants?.businessRules !== 'enforced'
    || value.repository?.invariants?.receipt !== 'verified'
    || value.repository?.invariants?.audit !== 'atomic'
  ) {
    fail('RepositoryRealms invariant evidence is missing.', 502, 'ceo_command_repository_evidence_missing');
  }
  return { receipt: sanitized, repository: value.repository };
}

export function ceoCommandRecordHref(resource, recordId) {
  if (resource === 'tasks' && recordId) return `/tasks?focus=${encodeURIComponent(recordId)}&from=ceo-command`;
  if (resource === 'approvals' && recordId) return `/approvals?focus=${encodeURIComponent(recordId)}&from=ceo-command`;
  if (resource === 'notifications') return '/dashboard';
  return '/dashboard';
}
