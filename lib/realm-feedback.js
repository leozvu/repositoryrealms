import { randomUUID } from 'node:crypto';
import { hasAny, isFreelancer } from './perm.js';
import { normalizeRealmIdempotencyKey, RealmOperationError } from './realm-operation.js';

export const REALM_FEEDBACK_SOURCE = 'realm_pilot';
export const REALM_FEEDBACK_TYPES = Object.freeze(['bug', 'friction', 'idea', 'support']);
export const REALM_FEEDBACK_IMPACTS = Object.freeze(['blocked', 'degraded', 'minor']);
export const REALM_FEEDBACK_STATUSES = Object.freeze(['open', 'in_progress', 'waiting', 'resolved', 'closed']);
export const REALM_FEEDBACK_PRIORITIES = Object.freeze(['high', 'normal', 'low']);

const TYPE_LABELS = Object.freeze({
  bug: 'Lỗi kỹ thuật',
  friction: 'Khó sử dụng',
  idea: 'Ý tưởng',
  support: 'Cần hỗ trợ',
});

const IMPACT_POLICY = Object.freeze({
  blocked: { priority: 'high', slaHours: 8 },
  degraded: { priority: 'normal', slaHours: 24 },
  minor: { priority: 'low', slaHours: 72 },
});

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanDetails(value, max = 2000) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

function safeInternalRoute(value) {
  const route = String(value ?? '').trim();
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) return '/dashboard';
  try {
    const parsed = new URL(route, 'https://realm.internal');
    if (parsed.origin !== 'https://realm.internal') return '/dashboard';
    return /^\/[a-z0-9/_-]*$/i.test(parsed.pathname) ? parsed.pathname.slice(0, 160) : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

function parseContext(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function requireInternalUser(user) {
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Realm pilot chỉ dành cho nhân sự nội bộ.', 403, 'freelancer_forbidden');
}

export function isRealmFeedbackManager(user) {
  return Boolean(user) && !isFreelancer(user) && hasAny(user, ['HR', 'PM']);
}

export function normalizeRealmFeedbackDraft(input = {}, { release = 'local' } = {}) {
  const category = REALM_FEEDBACK_TYPES.includes(input.category) ? input.category : null;
  const impact = REALM_FEEDBACK_IMPACTS.includes(input.impact) ? input.impact : null;
  const surface = input.surface === 'realm' ? 'realm' : input.surface === 'erp' ? 'erp' : null;
  const summary = cleanText(input.summary, 120);
  const details = cleanDetails(input.details);
  if (!category) throw new RealmOperationError('Hãy chọn loại phản hồi.', 400, 'realm_feedback_type_invalid');
  if (!impact) throw new RealmOperationError('Hãy chọn mức ảnh hưởng.', 400, 'realm_feedback_impact_invalid');
  if (!surface) throw new RealmOperationError('Giao diện phản hồi không hợp lệ.', 400, 'realm_feedback_surface_invalid');
  if (summary.length < 5) throw new RealmOperationError('Mô tả ngắn cần ít nhất 5 ký tự.', 400, 'realm_feedback_summary_short');
  if (details.length < 10) throw new RealmOperationError('Chi tiết cần ít nhất 10 ký tự để đội xử lý có thể tái hiện.', 400, 'realm_feedback_details_short');

  return {
    category,
    impact,
    surface,
    summary,
    details,
    context: {
      schemaVersion: 1,
      surface,
      route: safeInternalRoute(input.route),
      area: cleanText(input.area || (surface === 'realm' ? 'Great Hall' : 'ERP · CRM'), 64),
      impact,
      release: cleanText(release, 64) || 'local',
      privacy: 'no-record-content',
    },
  };
}

export function serializeRealmFeedback(row, reporterName = null) {
  const context = parseContext(row?.feedbackContext);
  return {
    id: row?.id,
    code: row?.code,
    title: row?.title,
    summary: String(row?.title || '').replace(/^\[Realm Pilot\]\[[^\]]+\]\s*/, ''),
    details: row?.desc || '',
    category: row?.feedbackType || 'support',
    surface: row?.feedbackSurface || context.surface || 'erp',
    impact: context.impact || 'degraded',
    context: {
      area: cleanText(context.area, 64),
      route: safeInternalRoute(context.route),
      release: cleanText(context.release, 64),
    },
    priority: row?.priority,
    status: row?.status,
    assigneeId: row?.assigneeId || null,
    reporterId: row?.reporterId || null,
    response: row?.feedbackResponse || null,
    reporter: reporterName ? { id: row?.reporterId, name: reporterName } : undefined,
    createdAt: row?.createdAt instanceof Date ? row.createdAt.toISOString() : row?.createdAt,
    updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : row?.updatedAt,
    resolvedAt: row?.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : row?.resolvedAt,
  };
}

export async function createRealmFeedback(db, user, input, idempotencyKey, {
  now = () => new Date(),
  idFactory = randomUUID,
  release = 'local',
} = {}) {
  requireInternalUser(user);
  const requestKey = normalizeRealmIdempotencyKey(idempotencyKey);
  const draft = normalizeRealmFeedbackDraft(input, { release });
  const createdAt = now();
  const policy = IMPACT_POLICY[draft.impact];
  const dateToken = createdAt.toISOString().slice(0, 10).replaceAll('-', '');
  const code = `RPF-${dateToken}-${idFactory().replaceAll('-', '').slice(0, 8).toUpperCase()}`;

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({ where: { requestKey } });
    if (existing) {
      if (existing.source !== REALM_FEEDBACK_SOURCE || existing.reporterId !== user.id) {
        throw new RealmOperationError('Idempotency key đã được sử dụng.', 409, 'realm_feedback_key_conflict');
      }
      return { row: existing, idempotent: true };
    }

    const row = await tx.ticket.create({
      data: {
        code,
        title: `[Realm Pilot][${TYPE_LABELS[draft.category]}] ${draft.summary}`,
        desc: draft.details,
        priority: policy.priority,
        status: 'open',
        channel: 'Realm Pilot',
        reporterId: user.id,
        source: REALM_FEEDBACK_SOURCE,
        feedbackType: draft.category,
        feedbackSurface: draft.surface,
        feedbackContext: JSON.stringify(draft.context),
        requestKey,
        createdAt,
        dueAt: new Date(createdAt.getTime() + policy.slaHours * 60 * 60 * 1000),
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name || 'Nhân sự',
        action: 'realm_feedback_create',
        entity: 'tickets',
        refId: row.id,
        detail: `${row.code} · ${draft.category} · ${draft.surface} · ${draft.impact}`,
      },
    });
    return { row, idempotent: false };
  }, { isolationLevel: 'Serializable' });

  return { ...serializeRealmFeedback(result.row), idempotent: result.idempotent };
}

function feedbackMetrics(rows) {
  const byStatus = Object.fromEntries(REALM_FEEDBACK_STATUSES.map((status) => [status, 0]));
  const byCategory = Object.fromEntries(REALM_FEEDBACK_TYPES.map((category) => [category, 0]));
  const bySurface = { realm: 0, erp: 0 };
  let blocked = 0;
  for (const row of rows) {
    if (byStatus[row.status] !== undefined) byStatus[row.status] += 1;
    if (byCategory[row.feedbackType] !== undefined) byCategory[row.feedbackType] += 1;
    if (bySurface[row.feedbackSurface] !== undefined) bySurface[row.feedbackSurface] += 1;
    if (parseContext(row.feedbackContext).impact === 'blocked') blocked += 1;
  }
  return {
    total: rows.length,
    unresolved: rows.filter((row) => !['resolved', 'closed'].includes(row.status)).length,
    blocked,
    byStatus,
    byCategory,
    bySurface,
  };
}

export async function loadRealmFeedbackOverview(db, user, { limit = 100, mine = false } = {}) {
  requireInternalUser(user);
  const manager = isRealmFeedbackManager(user);
  const manageScope = manager && !mine;
  const rows = await db.ticket.findMany({
    where: manageScope
      ? { source: REALM_FEEDBACK_SOURCE }
      : { source: REALM_FEEDBACK_SOURCE, reporterId: user.id },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(Number(limit) || 100, 200)),
  });
  let reporters = new Map();
  let handlers = [];
  if (manageScope) {
    const reporterIds = [...new Set(rows.map((row) => row.reporterId).filter(Boolean))];
    const users = reporterIds.length
      ? await db.user.findMany({ where: { id: { in: reporterIds } }, select: { id: true, name: true } })
      : [];
    reporters = new Map(users.map((row) => [row.id, row.name]));
    const activeUsers = await db.user.findMany({
      where: { status: 'active', userType: { not: 'freelancer' } },
      select: { id: true, name: true, role: true, roles: true, userType: true },
    });
    handlers = activeUsers.filter(isRealmFeedbackManager).map(({ id, name }) => ({ id, name }));
  }
  return {
    source: 'erp-ticket',
    manager,
    metrics: feedbackMetrics(rows),
    handlers,
    rows: rows.map((row) => serializeRealmFeedback(row, manageScope ? reporters.get(row.reporterId) || 'Nhân sự' : null)),
    privacy: {
      performanceTracking: false,
      durationTracking: false,
      capturedContext: ['surface', 'route', 'area', 'impact', 'release'],
      excludedContext: ['form-values', 'record-content', 'browser-history', 'keystrokes'],
    },
  };
}

export async function updateRealmFeedback(db, user, id, input = {}) {
  requireInternalUser(user);
  if (!isRealmFeedbackManager(user)) {
    throw new RealmOperationError('Chỉ Giám đốc, HR hoặc PM được xử lý phản hồi pilot.', 403, 'realm_feedback_manager_forbidden');
  }
  const feedbackId = cleanText(id, 100);
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (!feedbackId) throw new RealmOperationError('Thiếu mã phản hồi.', 400, 'realm_feedback_id_required');
  if (Number.isNaN(expectedUpdatedAt.getTime())) {
    throw new RealmOperationError('Phiên bản phản hồi không hợp lệ.', 400, 'realm_feedback_version_invalid');
  }
  const status = REALM_FEEDBACK_STATUSES.includes(input.status) ? input.status : null;
  const priority = REALM_FEEDBACK_PRIORITIES.includes(input.priority) ? input.priority : null;
  if (!status || !priority) throw new RealmOperationError('Trạng thái hoặc ưu tiên không hợp lệ.', 400, 'realm_feedback_update_invalid');
  const response = cleanDetails(input.response, 1000) || null;
  const assigneeId = input.assigneeId ? cleanText(input.assigneeId, 100) : null;

  const row = await db.$transaction(async (tx) => {
    const current = await tx.ticket.findUnique({ where: { id: feedbackId } });
    if (!current || current.source !== REALM_FEEDBACK_SOURCE) {
      throw new RealmOperationError('Không tìm thấy phản hồi Realm pilot.', 404, 'realm_feedback_not_found');
    }
    const currentVersion = current.updatedAt instanceof Date ? current.updatedAt : new Date(current.updatedAt);
    if (currentVersion.getTime() !== expectedUpdatedAt.getTime()) {
      throw new RealmOperationError('Phản hồi vừa được người khác cập nhật. Hãy tải lại trước khi lưu.', 409, 'realm_feedback_stale');
    }
    if (assigneeId) {
      const assignee = await tx.user.findFirst({ where: { id: assigneeId, status: 'active', userType: { not: 'freelancer' } }, select: { id: true } });
      if (!assignee) throw new RealmOperationError('Người xử lý không hợp lệ.', 400, 'realm_feedback_assignee_invalid');
    }
    const resolved = ['resolved', 'closed'].includes(status);
    const updated = await tx.ticket.update({
      where: { id: current.id },
      data: {
        status,
        priority,
        assigneeId,
        feedbackResponse: response,
        resolvedAt: resolved ? current.resolvedAt || new Date() : null,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name || 'Quản lý',
        action: 'realm_feedback_update',
        entity: 'tickets',
        refId: current.id,
        detail: `${current.code} · ${current.status} → ${status} · ${priority}`,
      },
    });
    return updated;
  }, { isolationLevel: 'Serializable' });

  return serializeRealmFeedback(row);
}
