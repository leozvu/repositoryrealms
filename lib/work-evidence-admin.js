import { hasAny } from './perm.js';
import {
  normalizeWorkEvidenceDraft,
  WorkEvidenceContractError,
  WORK_EVIDENCE_POLICY_V1,
} from './work-evidence-contract.js';

const REVIEW_REASONS = new Set([
  'wrong_subject',
  'wrong_timestamp',
  'wrong_source',
  'missing_context',
  'duplicate',
  'privacy_concern',
  'other',
]);

function actor(user) {
  return {
    id: String(user?.id || 'system'),
    name: String(user?.name || 'Evidence system'),
  };
}

function requireAuthenticated(user) {
  if (!user?.id) throw new WorkEvidenceContractError('Cần đăng nhập để ghi evidence.', 'work_evidence_auth_required', 401);
}

function authorizeWrite(user, draft, { trustedProducer }) {
  if (draft.sourceClass === 'declared') {
    requireAuthenticated(user);
    if (draft.actorId !== user.id) {
      throw new WorkEvidenceContractError('Người dùng chỉ được tự khai báo evidence của mình.', 'work_evidence_actor_mismatch', 403);
    }
    return;
  }
  if (draft.sourceClass === 'validated') {
    requireAuthenticated(user);
    if (!hasAny(user, ['PM', 'LEAD', 'HR'])) {
      throw new WorkEvidenceContractError('Chỉ quản lý hoặc HR được xác thực evidence.', 'work_evidence_validation_forbidden', 403);
    }
    if (draft.actorId !== user.id) {
      throw new WorkEvidenceContractError('Validator phải là người đang đăng nhập.', 'work_evidence_validator_mismatch', 403);
    }
    return;
  }
  if (!trustedProducer) {
    throw new WorkEvidenceContractError(
      'Observed/derived evidence chỉ được ghi bởi trusted server producer.',
      'work_evidence_trusted_producer_required',
      403,
    );
  }
}

function sameEvent(existing, draft) {
  const date = (value) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  return existing.subjectType === draft.subjectType
    && existing.subjectId === draft.subjectId
    && existing.eventType === draft.eventType
    && existing.sourceClass === draft.sourceClass
    && existing.purpose === draft.purpose
    && (existing.actorId || null) === (draft.actorId || null)
    && date(existing.occurredAt) === date(draft.occurredAt)
    && existing.confidence === draft.confidence
    && existing.provenance === draft.provenance
    && existing.metadata === draft.metadata
    && (existing.parentEventId || null) === (draft.parentEventId || null)
    && existing.schemaVersion === draft.schemaVersion
    && existing.policyVersion === draft.policyVersion;
}

function replay(existing, draft) {
  if (!sameEvent(existing, draft)) {
    throw new WorkEvidenceContractError(
      'Idempotency key đã được dùng cho evidence khác.',
      'work_evidence_idempotency_conflict',
      409,
    );
  }
  return {
    idempotent: true,
    event: existing,
    receipt: { id: existing.id, type: 'work_evidence.recorded', policyVersion: existing.policyVersion },
  };
}

function evidenceAudit(user, draft, eventId) {
  const owner = actor(user);
  return {
    userId: owner.id,
    userName: owner.name,
    action: 'evidence_recorded',
    entity: 'work_evidence',
    refId: eventId,
    detail: `${draft.eventType} | ${draft.sourceClass} | ${draft.purpose} | policy ${draft.policyVersion}`,
  };
}

async function verifyBusinessReceipt(db, draft) {
  const metadata = JSON.parse(draft.metadata);
  if (!metadata.businessReceiptId) return;
  const receipt = await db.realmActionReceipt.findUnique({ where: { id: metadata.businessReceiptId } });
  if (!receipt) {
    throw new WorkEvidenceContractError(
      'Không tìm thấy business receipt làm provenance cho evidence.',
      'work_evidence_business_receipt_not_found',
      409,
    );
  }
  if (receipt.entityId !== draft.subjectId) {
    throw new WorkEvidenceContractError(
      'Business receipt không thuộc đối tượng evidence.',
      'work_evidence_business_receipt_mismatch',
      409,
    );
  }
}

export async function recordWorkEvidenceEvent(db, user, input, {
  now = new Date(),
  trustedProducer = false,
  shadowMode = WORK_EVIDENCE_POLICY_V1.mode === 'shadow',
} = {}) {
  const actorId = input?.actorId ?? user?.id ?? null;
  const draft = normalizeWorkEvidenceDraft({ ...input, actorId }, { now, shadowMode });
  authorizeWrite(user, draft, { trustedProducer });

  const existing = await db.workEvidenceEvent.findUnique({ where: { idempotencyKey: draft.idempotencyKey } });
  if (existing) return replay(existing, draft);
  await verifyBusinessReceipt(db, draft);

  try {
    const result = await db.$transaction(async (tx) => {
      const event = await tx.workEvidenceEvent.create({ data: draft });
      await tx.auditLog.create({ data: evidenceAudit(user, draft, event.id) });
      return event;
    });
    return {
      idempotent: false,
      event: result,
      receipt: { id: result.id, type: 'work_evidence.recorded', policyVersion: result.policyVersion },
    };
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await db.workEvidenceEvent.findUnique({ where: { idempotencyKey: draft.idempotencyKey } });
    if (!raced) throw error;
    return replay(raced, draft);
  }
}

function safeTake(value) {
  if (value === undefined || value === null || value === '') return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new WorkEvidenceContractError('Evidence page size phải trong khoảng 1–100.', 'work_evidence_page_size_invalid');
  }
  return parsed;
}

export async function listOwnWorkEvidenceEvents(db, user, { before, take } = {}) {
  requireAuthenticated(user);
  const beforeDate = before ? new Date(before) : null;
  if (beforeDate && Number.isNaN(beforeDate.getTime())) {
    throw new WorkEvidenceContractError('Evidence cursor không hợp lệ.', 'work_evidence_cursor_invalid');
  }
  return db.workEvidenceEvent.findMany({
    where: {
      actorId: user.id,
      ...(beforeDate ? { occurredAt: { lt: beforeDate } } : {}),
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: safeTake(take),
  });
}

function reviewToken(value, pattern, message, code) {
  const normalized = String(value ?? '').trim();
  if (!pattern.test(normalized)) throw new WorkEvidenceContractError(message, code);
  return normalized;
}

function reviewAudit(user, review, evidenceId) {
  return {
    userId: user.id,
    userName: user.name || 'ERP user',
    action: 'evidence_review_requested',
    entity: 'work_evidence',
    refId: evidenceId,
    detail: `${review.reasonCode} | review ${review.id}`,
  };
}

export async function requestWorkEvidenceReview(db, user, input = {}) {
  requireAuthenticated(user);
  const evidenceEventId = reviewToken(input.evidenceEventId, /^[a-zA-Z0-9:_-]{1,120}$/, 'Evidence cần phản hồi không hợp lệ.', 'work_evidence_review_target_invalid');
  const reasonCode = reviewToken(input.reasonCode, /^[a-z_]{3,40}$/, 'Lý do phản hồi không hợp lệ.', 'work_evidence_review_reason_invalid');
  if (!REVIEW_REASONS.has(reasonCode)) {
    throw new WorkEvidenceContractError('Lý do phản hồi chưa được allowlist.', 'work_evidence_review_reason_not_allowed');
  }
  const note = String(input.note || '').trim();
  if (note.length > 1000) throw new WorkEvidenceContractError('Nội dung phản hồi tối đa 1000 ký tự.', 'work_evidence_review_note_too_long');

  const evidence = await db.workEvidenceEvent.findUnique({ where: { id: evidenceEventId } });
  if (!evidence) throw new WorkEvidenceContractError('Không tìm thấy evidence.', 'work_evidence_not_found', 404);
  if (evidence.actorId !== user.id && !hasAny(user, ['HR'])) {
    throw new WorkEvidenceContractError('Bạn không có quyền phản hồi evidence này.', 'work_evidence_review_forbidden', 403);
  }
  const pending = await db.evidenceReviewRequest.findFirst({
    where: { evidenceEventId, requestedById: user.id, status: 'pending' },
  });
  if (pending) return { idempotent: true, review: pending };

  const review = await db.$transaction(async (tx) => {
    const created = await tx.evidenceReviewRequest.create({ data: {
      evidenceEventId,
      requestedById: user.id,
      reasonCode,
      note: note || null,
    } });
    await tx.auditLog.create({ data: reviewAudit(user, created, evidenceEventId) });
    return created;
  });
  return { idempotent: false, review };
}
