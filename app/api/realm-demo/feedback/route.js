import { currentUser } from '@/lib/auth';
import { emitEvent, notify } from '@/lib/events';
import { hasAny, isFreelancer } from '@/lib/perm';
import { prisma } from '@/lib/prisma';
import {
  createRealmFeedback,
  loadRealmFeedbackOverview,
  updateRealmFeedback,
} from '@/lib/realm-feedback';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { loadRealmPilotDecision } from '@/lib/realm-pilot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authenticatedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Realm pilot chỉ dành cho nhân sự nội bộ.', 403, 'freelancer_forbidden');
  return user;
}

async function requireFeedbackFeature(user) {
  const decision = await loadRealmPilotDecision(prisma, user);
  if (!decision.config.features.feedback) {
    throw new RealmOperationError('Guild Support đang tạm tắt; hãy liên hệ quản lý qua ERP.', 503, 'realm_feedback_disabled');
  }
}

async function feedbackHandlers() {
  const users = await prisma.user.findMany({
    where: { status: 'active', userType: { not: 'freelancer' } },
    select: { id: true, role: true, roles: true },
  });
  return users.filter((user) => hasAny(user, ['HR', 'PM'])).map((user) => user.id);
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.feedback', operation: 'feedback.read' });
  try {
    const user = await authenticatedUser();
    await requireFeedbackFeature(user);
    const mine = new URL(request.url).searchParams.get('scope') === 'mine';
    const overview = await loadRealmFeedbackOverview(prisma, user, { mine });
    return realmJsonResponse(trace, overview, { code: 'realm_feedback_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải phản hồi Realm pilot.',
      fallbackCode: 'realm_feedback_error',
    });
  }
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.feedback', operation: 'feedback.create' });
  try {
    const user = await authenticatedUser();
    await requireFeedbackFeature(user);
    const body = await request.json().catch(() => ({}));
    const feedback = await createRealmFeedback(
      prisma,
      user,
      body,
      request.headers.get('Idempotency-Key'),
      { release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION || 'local' },
    );
    if (!feedback.idempotent) {
      await emitEvent('tickets', 'create', feedback, null, user);
      const handlers = (await feedbackHandlers()).filter((id) => id !== user.id);
      await notify(
        handlers,
        `${user.name || 'Nhân sự'} gửi phản hồi ${feedback.code}: ${feedback.summary}`,
        `/settings?realmFeedback=${encodeURIComponent(feedback.id)}`,
      );
    }
    return realmJsonResponse(trace, { ok: true, feedback }, {
      status: feedback.idempotent ? 200 : 201,
      code: feedback.idempotent ? 'realm_feedback_idempotent' : 'realm_feedback_created',
      outcome: feedback.idempotent ? 'idempotent' : 'success',
    });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể gửi phản hồi Realm pilot.',
      fallbackCode: 'realm_feedback_create_error',
    });
  }
}

export async function PATCH(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.feedback', operation: 'feedback.update' });
  try {
    const user = await authenticatedUser();
    await requireFeedbackFeature(user);
    const body = await request.json().catch(() => ({}));
    const feedback = await updateRealmFeedback(prisma, user, body.id, body);
    await emitEvent('tickets', 'update', feedback, null, user);
    if (feedback.reporterId && feedback.reporterId !== user.id) {
      await notify(
        feedback.reporterId,
        `${feedback.code} đã chuyển sang trạng thái ${feedback.status}${feedback.response ? ': ' + feedback.response.slice(0, 120) : ''}`,
        `/tickets?focus=${encodeURIComponent(feedback.id)}&from=realm-feedback`,
      );
    }
    const overview = await loadRealmFeedbackOverview(prisma, user);
    return realmJsonResponse(trace, { ok: true, feedback, overview }, { code: 'realm_feedback_updated' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể cập nhật phản hồi Realm pilot.',
      fallbackCode: 'realm_feedback_update_error',
    });
  }
}
