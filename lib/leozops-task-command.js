import { createHash } from 'node:crypto';

export const LEOZOPS_TASK_COMMAND_CONTRACT = 'repositoryrealms.leozops.task-command';
export const LEOZOPS_TASK_COMMAND_RECEIPT_CONTRACT = 'repositoryrealms.leozops.task-command-receipt';
export const LEOZOPS_TASK_APPROVAL_RECEIPT_CONTRACT = 'repositoryrealms.leozops.task-approval-receipt';
export const LEOZOPS_TASK_COMMAND_VERSION = 1;
export const LEOZOPS_TASK_COMMAND_KEY = 'egoric.task.create.v1';
export const LEOZOPS_TASK_COMMAND_PATH = '/api/integrations/leozops/v1/commands/create-task';
export const LEOZOPS_TASK_RECEIPT_PATH = `${LEOZOPS_TASK_COMMAND_PATH}/receipts`;
export const LEOZOPS_TASK_COMMAND_MAX_BODY_BYTES = 12 * 1024;
export const LEOZOPS_TASK_PREVIEW_TTL_MS = 10 * 60_000;
export const LEOZOPS_TASK_APPROVAL_TTL_MS = 15 * 60_000;

export const LEOZOPS_TASK_OPERATIONS = Object.freeze([
  'preview',
  'approve_execute',
  'execute',
  'preview_rollback',
  'approve_rollback',
  'rollback',
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9:._-]{15,191}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:^|[^A-Za-z0-9])\+?\d(?:[\s().-]*\d){7,}(?:[^A-Za-z0-9]|$)/;

export class LeozOpsTaskCommandError extends Error {
  constructor(message, status = 400, code = 'leozops_task_command_invalid') {
    super(message);
    this.name = 'LeozOpsTaskCommandError';
    this.status = status;
    this.code = code;
  }
}

function fail(message, status, code) {
  throw new LeozOpsTaskCommandError(message, status, code);
}

function exactObject(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object.`, 400, 'leozops_task_body_invalid');
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) {
    fail(`${field} fields are invalid.`, 400, 'leozops_task_unknown_or_missing_field');
  }
}

function safeId(value, field, pattern = SAFE_ID) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!pattern.test(normalized)) fail(`${field} is invalid.`, 400, `leozops_task_${field}_invalid`);
  return normalized;
}

function fingerprint(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!HASH.test(normalized)) fail(`${field} is invalid.`, 400, `leozops_task_${field}_invalid`);
  return normalized;
}

function operatingText(value, field, min, max, { optional = false, multiline = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string') {
    fail(`${field} must be text.`, 400, `leozops_task_${field}_invalid`);
  }
  let normalized = value;
  normalized = normalized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  normalized = multiline ? normalized.replace(/\r\n?/g, '\n').trim() : normalized.replace(/\s+/g, ' ').trim();
  if (optional && !normalized) return null;
  if (normalized.length < min || normalized.length > max || EMAIL.test(normalized) || PHONE.test(normalized)) {
    fail(`${field} is invalid or contains contact data.`, 400, `leozops_task_${field}_invalid`);
  }
  return normalized;
}

function dueDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  if (!ISO_DAY.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00.000Z`))) {
    fail('dueDate is invalid.', 400, 'leozops_task_due_date_invalid');
  }
  return normalized;
}

export function stableLeozOpsTaskJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableLeozOpsTaskJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableLeozOpsTaskJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashLeozOpsTaskValue(value) {
  return `sha256:${createHash('sha256').update(stableLeozOpsTaskJson(value)).digest('hex')}`;
}

export function normalizeLeozOpsTaskPayload(value) {
  exactObject(value, ['title', 'note', 'dueDate', 'priority', 'estHours'], 'payload');
  const priority = typeof value.priority === 'string' ? value.priority.trim().toLowerCase() : '';
  if (!PRIORITIES.has(priority)) fail('priority is invalid.', 400, 'leozops_task_priority_invalid');
  const estHours = value.estHours;
  if (typeof estHours !== 'number' || !Number.isFinite(estHours) || estHours < 0 || estHours > 1_000) {
    fail('estHours is invalid.', 400, 'leozops_task_estimated_hours_invalid');
  }
  return {
    title: operatingText(value.title, 'title', 3, 160),
    note: operatingText(value.note, 'note', 0, 1_000, { optional: true, multiline: true }),
    dueDate: dueDate(value.dueDate),
    priority,
    estHours: Math.round(estHours * 100) / 100,
  };
}

function common(input, allowed) {
  exactObject(input, allowed, 'command');
  if (input.contract !== LEOZOPS_TASK_COMMAND_CONTRACT || input.version !== LEOZOPS_TASK_COMMAND_VERSION) {
    fail('Task command contract is unsupported.', 409, 'leozops_task_contract_unsupported');
  }
  if (!LEOZOPS_TASK_OPERATIONS.includes(input.operation)) {
    fail('Task command operation is unsupported.', 400, 'leozops_task_operation_unsupported');
  }
  return {
    contract: LEOZOPS_TASK_COMMAND_CONTRACT,
    version: LEOZOPS_TASK_COMMAND_VERSION,
    operation: input.operation,
    targetEntityId: safeId(input.targetEntityId, 'target_entity', /^[a-z0-9][a-z0-9-]{1,47}$/),
    actorSubject: safeId(input.actorSubject, 'actor_subject'),
    idempotencyKey: safeId(input.idempotencyKey, 'idempotency_key', IDEMPOTENCY_KEY),
    correlationId: safeId(input.correlationId, 'correlation_id'),
  };
}

export function normalizeLeozOpsTaskCommand(input = {}) {
  const baseKeys = ['contract', 'version', 'operation', 'targetEntityId', 'actorSubject', 'idempotencyKey', 'correlationId'];
  const operation = String(input?.operation || '').trim();
  if (['preview', 'approve_execute', 'execute'].includes(operation)) {
    const extra = operation === 'approve_execute' ? ['payload', 'previewFingerprint']
      : operation === 'execute' ? ['payload', 'approvalId'] : ['payload'];
    const result = common(input, [...baseKeys, ...extra]);
    const normalized = { ...result, payload: normalizeLeozOpsTaskPayload(input.payload) };
    if (operation === 'approve_execute') normalized.previewFingerprint = fingerprint(input.previewFingerprint, 'preview_fingerprint');
    if (operation === 'execute') normalized.approvalId = safeId(input.approvalId, 'approval_id');
    return normalized;
  }
  if (['preview_rollback', 'approve_rollback', 'rollback'].includes(operation)) {
    const extra = operation === 'approve_rollback' ? ['commandId', 'previewFingerprint']
      : operation === 'rollback' ? ['commandId', 'approvalId'] : ['commandId'];
    const result = common(input, [...baseKeys, ...extra]);
    const normalized = { ...result, commandId: safeId(input.commandId, 'command_id') };
    if (operation === 'approve_rollback') normalized.previewFingerprint = fingerprint(input.previewFingerprint, 'preview_fingerprint');
    if (operation === 'rollback') normalized.approvalId = safeId(input.approvalId, 'approval_id');
    return normalized;
  }
  fail('Task command operation is unsupported.', 400, 'leozops_task_operation_unsupported');
}

export function assertLeozOpsTaskCommandRequestHeaders(request, command) {
  const headers = request?.headers;
  const get = (name) => headers?.get?.(name) || '';
  if (
    get('x-correlation-id') !== command.correlationId
    || get('idempotency-key') !== command.idempotencyKey
    || get('x-leozops-actor-subject') !== command.actorSubject
    || get('x-leozops-operation') !== command.operation
  ) {
    fail('Task command headers do not match the envelope.', 400, 'leozops_task_header_mismatch');
  }
}

export function leozOpsTaskRequestFingerprint(command) {
  if (command.payload) {
    return hashLeozOpsTaskValue({
      commandKey: LEOZOPS_TASK_COMMAND_KEY,
      targetEntityId: command.targetEntityId,
      payload: command.payload,
    });
  }
  return hashLeozOpsTaskValue({
    commandKey: LEOZOPS_TASK_COMMAND_KEY,
    targetEntityId: command.targetEntityId,
    commandId: command.commandId,
    operation: 'rollback',
  });
}

export function leozOpsTaskPreviewEvidence(command, { taskStateFingerprint = null, now = new Date() } = {}) {
  const requestFingerprint = leozOpsTaskRequestFingerprint(command);
  const targetFingerprint = hashLeozOpsTaskValue({
    system: 'egoric',
    targetEntityId: command.targetEntityId,
    endpointPath: LEOZOPS_TASK_COMMAND_PATH,
    commandKey: LEOZOPS_TASK_COMMAND_KEY,
  });
  const effectFingerprint = hashLeozOpsTaskValue(command.payload
    ? { effect: 'create_unassigned_task', payload: command.payload }
    : { effect: 'delete_exact_command_task', commandId: command.commandId, taskStateFingerprint });
  const kind = command.payload ? 'execute' : 'rollback';
  const previewFingerprint = hashLeozOpsTaskValue({
    kind,
    requestFingerprint,
    targetFingerprint,
    effectFingerprint,
    rollbackStrategyCode: kind === 'execute' ? 'delete_exact_unchanged_command_task' : 'not_applicable',
  });
  return {
    kind,
    requestFingerprint,
    targetFingerprint,
    effectFingerprint,
    previewFingerprint,
    summaryCode: kind === 'execute' ? 'create_unassigned_task' : 'delete_exact_unchanged_command_task',
    rollbackStrategyCode: kind === 'execute' ? 'delete_exact_unchanged_command_task' : 'not_applicable',
    estimatedCostMinor: 0,
    currency: 'VND',
    externalMutationCount: 0,
    previewedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LEOZOPS_TASK_PREVIEW_TTL_MS).toISOString(),
  };
}
