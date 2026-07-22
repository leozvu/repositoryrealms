export const WORK_EVIDENCE_CONTRACT_VERSION = '1.0.0';
export const WORK_EVIDENCE_SCHEMA_VERSION = 1;

export const EVIDENCE_SOURCE_CLASSES = Object.freeze(['declared', 'observed', 'validated', 'derived']);
export const EVIDENCE_CONFIDENCE_BANDS = Object.freeze(['unverified', 'low', 'medium', 'high', 'unrated']);
export const EVIDENCE_OPERATIONAL_PURPOSES = Object.freeze([
  'operational_visibility',
  'auditability',
  'capacity_planning',
  'data_quality',
]);
export const EVIDENCE_PROHIBITED_DECISION_USES = Object.freeze([
  'gold_award',
  'payroll',
  'discipline',
  'termination',
  'individual_performance_ranking',
]);

export const EVIDENCE_PROHIBITED_SIGNALS = Object.freeze([
  'gps', 'latitude', 'longitude', 'precise_location',
  'keystroke', 'keylogger', 'keyboard_activity',
  'mouse_activity', 'cursor_tracking',
  'browser_history', 'screen_capture', 'screenshot',
  'clipboard', 'camera', 'microphone', 'raw_ip', 'raw_device_id',
]);

const EVENT_RULES = Object.freeze({
  'task.started': rule(['task'], ['observed'], ['businessReceiptId', 'surface', 'taskStatus'], ['businessReceiptId']),
  'task.blocked': rule(['task'], ['declared', 'observed', 'validated'], ['businessReceiptId', 'surface', 'reasonCode', 'taskStatus']),
  'task.completed': rule(['task'], ['observed'], ['businessReceiptId', 'surface', 'taskStatus'], ['businessReceiptId']),
  'timelog.submitted': rule(['timelog'], ['declared'], ['hours', 'billable', 'surface'], ['hours']),
  'timelog.approved': rule(['timelog'], ['validated'], ['businessReceiptId', 'hours', 'billable', 'validatorRole'], ['businessReceiptId', 'hours', 'validatorRole']),
  'attendance.checkin': rule(['attendance', 'user_day'], ['declared'], ['surface', 'sessionIdHash', 'deviceTrust', 'networkTrust', 'activityKind']),
  'attendance.checkout': rule(['attendance', 'user_day'], ['declared'], ['surface', 'sessionIdHash', 'deviceTrust', 'networkTrust', 'activityKind']),
  'attendance.confidence_calculated': rule(['attendance', 'user_day'], ['derived'], ['factorCount', 'evidenceWindowMinutes', 'ruleVersion'], ['factorCount', 'ruleVersion']),
  'manager.validation': rule(['task', 'timelog', 'attendance', 'user_day'], ['validated'], ['businessReceiptId', 'decision', 'reasonCode', 'validatorRole'], ['businessReceiptId', 'decision', 'reasonCode', 'validatorRole']),
  'work.variance_calculated': rule(['task'], ['derived'], ['estimateHours', 'actualHours', 'sampleSize', 'ruleVersion'], ['estimateHours', 'actualHours', 'sampleSize', 'ruleVersion']),
  'evidence.correction_requested': rule(['evidence'], ['declared'], ['reasonCode'], ['reasonCode']),
  'evidence.corrected': rule(['evidence'], ['validated'], ['businessReceiptId', 'reasonCode', 'validatorRole'], ['businessReceiptId', 'reasonCode', 'validatorRole']),
});

export const WORK_EVIDENCE_EVENT_TYPES = Object.freeze(Object.keys(EVENT_RULES));

export const WORK_EVIDENCE_POLICY_V1 = deepFreeze({
  version: WORK_EVIDENCE_CONTRACT_VERSION,
  mode: 'shadow',
  collectionActive: false,
  retentionDays: 365,
  principles: [
    'declared_observed_validated_derived_are_distinct',
    'presence_is_not_productivity',
    'no_single_metric_employee_decision',
    'data_minimization',
    'explainability_and_correction',
  ],
  operationalPurposes: [...EVIDENCE_OPERATIONAL_PURPOSES],
  prohibitedDecisionUses: [...EVIDENCE_PROHIBITED_DECISION_USES],
  prohibitedSignals: [...EVIDENCE_PROHIBITED_SIGNALS],
  activationRequires: ['CEO', 'HR', 'Operations', 'Technology'],
});

export class WorkEvidenceContractError extends Error {
  constructor(message, code = 'work_evidence_contract_invalid', status = 400) {
    super(message);
    this.name = 'WorkEvidenceContractError';
    this.code = code;
    this.status = status;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function rule(subjectTypes, sourceClasses, metadataKeys, requiredMetadata = []) {
  return deepFreeze({ subjectTypes, sourceClasses, metadataKeys, requiredMetadata });
}

function token(value, pattern, label, code) {
  const normalized = String(value ?? '').trim();
  if (!pattern.test(normalized)) throw new WorkEvidenceContractError(`${label} không hợp lệ.`, code);
  return normalized;
}

function optionalToken(value, pattern, label, code) {
  if (value === null || value === undefined || value === '') return null;
  return token(value, pattern, label, code);
}

function instant(value, label, code) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new WorkEvidenceContractError(`${label} không hợp lệ.`, code);
  return parsed;
}

function retentionDate(now, days) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function forbiddenKey(key) {
  const normalized = String(key).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return EVIDENCE_PROHIBITED_SIGNALS.find((signal) => normalized.includes(signal)) || null;
}

function assertPrimitiveMetadata(metadata) {
  for (const [key, value] of Object.entries(metadata)) {
    const signal = forbiddenKey(key);
    if (signal) {
      throw new WorkEvidenceContractError(`Tín hiệu giám sát '${signal}' bị cấm.`, 'work_evidence_surveillance_signal_prohibited');
    }
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      throw new WorkEvidenceContractError(`Metadata '${key}' chỉ được chứa giá trị đơn.`, 'work_evidence_metadata_shape_invalid');
    }
  }
}

function normalizeMetadata(eventType, value) {
  const metadata = value == null ? {} : value;
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
    throw new WorkEvidenceContractError('Evidence metadata phải là object.', 'work_evidence_metadata_invalid');
  }
  assertPrimitiveMetadata(metadata);
  const allowlist = new Set(EVENT_RULES[eventType].metadataKeys);
  const unknown = Object.keys(metadata).find((key) => !allowlist.has(key));
  if (unknown) throw new WorkEvidenceContractError(`Metadata '${unknown}' chưa được allowlist.`, 'work_evidence_metadata_not_allowed');
  const missing = EVENT_RULES[eventType].requiredMetadata.find((key) => metadata[key] === null || metadata[key] === undefined || metadata[key] === '');
  if (missing) throw new WorkEvidenceContractError(`Metadata '${missing}' là bắt buộc.`, 'work_evidence_metadata_required');

  if ('hours' in metadata && (!Number.isFinite(metadata.hours) || metadata.hours < 0 || metadata.hours > 24)) {
    throw new WorkEvidenceContractError('Số giờ evidence phải trong khoảng 0–24.', 'work_evidence_hours_invalid');
  }
  if ('sessionIdHash' in metadata && !/^[a-f0-9]{64}$/.test(String(metadata.sessionIdHash))) {
    throw new WorkEvidenceContractError('Session chỉ được lưu dưới dạng SHA-256.', 'work_evidence_session_hash_invalid');
  }
  if ('surface' in metadata && !['erp', 'realm', 'api', 'import'].includes(metadata.surface)) {
    throw new WorkEvidenceContractError('Surface evidence không hợp lệ.', 'work_evidence_surface_invalid');
  }
  if ('deviceTrust' in metadata && !['known', 'new', 'unknown'].includes(metadata.deviceTrust)) {
    throw new WorkEvidenceContractError('Device trust không hợp lệ.', 'work_evidence_device_trust_invalid');
  }
  if ('networkTrust' in metadata && !['corporate', 'trusted', 'unknown', 'risky'].includes(metadata.networkTrust)) {
    throw new WorkEvidenceContractError('Network trust không hợp lệ.', 'work_evidence_network_trust_invalid');
  }
  if ('businessReceiptId' in metadata && !/^[a-zA-Z0-9:_-]{1,120}$/.test(String(metadata.businessReceiptId))) {
    throw new WorkEvidenceContractError('Business receipt không hợp lệ.', 'work_evidence_receipt_invalid');
  }
  if ('taskStatus' in metadata && !['todo', 'doing', 'review', 'blocked', 'done'].includes(metadata.taskStatus)) {
    throw new WorkEvidenceContractError('Task status evidence không hợp lệ.', 'work_evidence_task_status_invalid');
  }
  if ('billable' in metadata && typeof metadata.billable !== 'boolean') {
    throw new WorkEvidenceContractError('Billable evidence phải là boolean.', 'work_evidence_billable_invalid');
  }
  if ('validatorRole' in metadata && !['DIRECTOR', 'PM', 'LEAD', 'HR'].includes(metadata.validatorRole)) {
    throw new WorkEvidenceContractError('Validator role không hợp lệ.', 'work_evidence_validator_role_invalid');
  }
  if ('decision' in metadata && !['confirmed', 'adjusted', 'rejected'].includes(metadata.decision)) {
    throw new WorkEvidenceContractError('Validation decision không hợp lệ.', 'work_evidence_decision_invalid');
  }
  if ('reasonCode' in metadata && !/^[a-z_]{3,50}$/.test(String(metadata.reasonCode))) {
    throw new WorkEvidenceContractError('Reason code không hợp lệ.', 'work_evidence_reason_code_invalid');
  }
  if ('activityKind' in metadata && !['manual_checkin', 'manual_checkout', 'business_action', 'session_authenticated'].includes(metadata.activityKind)) {
    throw new WorkEvidenceContractError('Activity kind không hợp lệ.', 'work_evidence_activity_kind_invalid');
  }
  if ('ruleVersion' in metadata && !/^[a-zA-Z0-9._-]{1,50}$/.test(String(metadata.ruleVersion))) {
    throw new WorkEvidenceContractError('Rule version không hợp lệ.', 'work_evidence_rule_version_invalid');
  }
  for (const integerKey of ['factorCount', 'evidenceWindowMinutes', 'sampleSize']) {
    if (integerKey in metadata && (!Number.isInteger(metadata[integerKey]) || metadata[integerKey] < 0 || metadata[integerKey] > 100000)) {
      throw new WorkEvidenceContractError(`Metadata '${integerKey}' phải là số nguyên không âm.`, 'work_evidence_metric_invalid');
    }
  }
  for (const hourKey of ['estimateHours', 'actualHours']) {
    if (hourKey in metadata && (!Number.isFinite(metadata[hourKey]) || metadata[hourKey] < 0 || metadata[hourKey] > 10000)) {
      throw new WorkEvidenceContractError(`Metadata '${hourKey}' không hợp lệ.`, 'work_evidence_metric_invalid');
    }
  }
  const serialized = JSON.stringify(metadata);
  if (Buffer.byteLength(serialized, 'utf8') > 2048) {
    throw new WorkEvidenceContractError('Evidence metadata vượt quá 2KB.', 'work_evidence_metadata_too_large');
  }
  return Object.fromEntries(Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right)));
}

export function assertEvidencePurposeAllowed(purpose, { shadowMode = true } = {}) {
  const normalized = token(purpose, /^[a-z_]{3,50}$/, 'Mục đích evidence', 'work_evidence_purpose_invalid');
  if (shadowMode && EVIDENCE_PROHIBITED_DECISION_USES.includes(normalized)) {
    throw new WorkEvidenceContractError(
      'Shadow mode không cho phép dùng evidence cho Gold, payroll, kỷ luật hoặc xếp hạng cá nhân.',
      'work_evidence_shadow_decision_prohibited',
      409,
    );
  }
  if (!EVIDENCE_OPERATIONAL_PURPOSES.includes(normalized)) {
    throw new WorkEvidenceContractError('Mục đích evidence chưa được governance contract cho phép.', 'work_evidence_purpose_not_allowed', 403);
  }
  return normalized;
}

function defaultConfidence(sourceClass) {
  if (sourceClass === 'declared') return 'unverified';
  if (sourceClass === 'observed') return 'medium';
  if (sourceClass === 'validated') return 'high';
  return 'unrated';
}

export function normalizeWorkEvidenceDraft(input = {}, {
  now = new Date(),
  shadowMode = true,
  retentionDays = WORK_EVIDENCE_POLICY_V1.retentionDays,
} = {}) {
  const clock = instant(now, 'Thời điểm ghi nhận', 'work_evidence_clock_invalid');
  const eventType = token(input.eventType, /^[a-z]+\.[a-z_]+$/, 'Loại evidence', 'work_evidence_event_type_invalid');
  const eventRule = EVENT_RULES[eventType];
  if (!eventRule) throw new WorkEvidenceContractError('Loại evidence chưa được allowlist.', 'work_evidence_event_type_not_allowed');
  const subjectType = token(input.subjectType, /^[a-z_]{2,30}$/, 'Loại đối tượng', 'work_evidence_subject_type_invalid');
  if (!eventRule.subjectTypes.includes(subjectType)) {
    throw new WorkEvidenceContractError('Loại đối tượng không phù hợp với evidence.', 'work_evidence_subject_mismatch');
  }
  const sourceClass = token(input.sourceClass, /^[a-z]+$/, 'Nguồn evidence', 'work_evidence_source_invalid');
  if (!eventRule.sourceClasses.includes(sourceClass)) {
    throw new WorkEvidenceContractError('Nguồn evidence không phù hợp với loại sự kiện.', 'work_evidence_source_mismatch');
  }
  const occurredAt = instant(input.occurredAt, 'Thời điểm xảy ra', 'work_evidence_occurred_at_invalid');
  if (occurredAt.getTime() > clock.getTime() + 5 * 60 * 1000) {
    throw new WorkEvidenceContractError('Evidence không thể nằm quá 5 phút trong tương lai.', 'work_evidence_future_event');
  }
  const provenance = token(input.provenance, /^[a-z_]{3,50}$/, 'Provenance', 'work_evidence_provenance_invalid');
  if (!['user_input', 'repository_receipt', 'manager_review', 'approved_timelog', 'rule_engine'].includes(provenance)) {
    throw new WorkEvidenceContractError('Provenance chưa được allowlist.', 'work_evidence_provenance_not_allowed');
  }
  const confidence = input.confidence == null ? defaultConfidence(sourceClass) : token(
    input.confidence, /^[a-z]+$/, 'Confidence', 'work_evidence_confidence_invalid',
  );
  if (!EVIDENCE_CONFIDENCE_BANDS.includes(confidence)) {
    throw new WorkEvidenceContractError('Confidence band chưa được cho phép.', 'work_evidence_confidence_not_allowed');
  }
  if (sourceClass === 'declared' && confidence !== 'unverified') {
    throw new WorkEvidenceContractError('Self-declared evidence phải giữ trạng thái unverified.', 'work_evidence_declared_confidence_invalid');
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 730) {
    throw new WorkEvidenceContractError('Retention phải nằm trong khoảng 30–730 ngày.', 'work_evidence_retention_invalid');
  }
  return Object.freeze({
    idempotencyKey: token(input.idempotencyKey, /^[a-zA-Z0-9:_-]{16,160}$/, 'Idempotency key', 'work_evidence_idempotency_invalid'),
    subjectType,
    subjectId: token(input.subjectId, /^[a-zA-Z0-9:_-]{1,120}$/, 'Mã đối tượng', 'work_evidence_subject_id_invalid'),
    eventType,
    sourceClass,
    purpose: assertEvidencePurposeAllowed(input.purpose, { shadowMode }),
    actorId: optionalToken(input.actorId, /^[a-zA-Z0-9:_-]{1,120}$/, 'Người tạo evidence', 'work_evidence_actor_invalid'),
    occurredAt,
    confidence,
    provenance,
    metadata: JSON.stringify(normalizeMetadata(eventType, input.metadata)),
    parentEventId: optionalToken(input.parentEventId, /^[a-zA-Z0-9:_-]{1,120}$/, 'Evidence cha', 'work_evidence_parent_invalid'),
    schemaVersion: WORK_EVIDENCE_SCHEMA_VERSION,
    policyVersion: WORK_EVIDENCE_CONTRACT_VERSION,
    retentionUntil: retentionDate(clock, retentionDays),
  });
}

export function evidenceExplanation(event) {
  return Object.freeze({
    source: event?.sourceClass || 'unknown',
    confidence: event?.confidence || 'unrated',
    purpose: event?.purpose || 'unknown',
    policyVersion: event?.policyVersion || WORK_EVIDENCE_CONTRACT_VERSION,
    isPerformanceScore: false,
    presenceEqualsProductivity: false,
  });
}
