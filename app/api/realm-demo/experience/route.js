import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector, isFreelancer } from '@/lib/perm';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { loadRealmPilotDecision } from '@/lib/realm-pilot';
import { loadRealmLaunchReadiness } from '@/lib/realm-readiness';
import { evaluateRealmExperiencePilot } from '@/lib/realm-experience';
import { loadRealmExperienceTelemetry, recordRealmExperienceEvent } from '@/lib/realm-experience-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authenticatedInternalUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Realm pilot chỉ dành cho nhân sự nội bộ.', 403, 'freelancer_forbidden');
  return user;
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.experience', operation: 'experience.aggregate' });
  try {
    const user = await authenticatedInternalUser();
    const decision = await loadRealmPilotDecision(prisma, user);
    if (!decision.allowed) throw new RealmOperationError(decision.reason, 403, decision.code);
    const body = await request.json().catch(() => ({}));
    await recordRealmExperienceEvent(prisma, body);
    return realmJsonResponse(trace, { accepted: true, privacy: 'aggregate-only' }, { status: 202, code: 'realm_experience_accepted' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể ghi nhận experience signal.',
      fallbackCode: 'realm_experience_event_error',
    });
  }
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.experience', operation: 'experience.scorecard' });
  try {
    const user = await authenticatedInternalUser();
    if (!isDirector(user)) throw new RealmOperationError('Chỉ Giám đốc được xem Experience Pilot scorecard.', 403, 'realm_experience_forbidden');
    const decision = await loadRealmPilotDecision(prisma, user);
    const [telemetry, readiness, openFeedback, blockedFeedback] = await Promise.all([
      loadRealmExperienceTelemetry(prisma),
      loadRealmLaunchReadiness(prisma, decision.config),
      prisma.ticket.count({ where: { source: 'realm_pilot', status: { notIn: ['resolved', 'closed'] } } }),
      prisma.ticket.count({ where: { source: 'realm_pilot', status: { notIn: ['resolved', 'closed'] }, feedbackContext: { contains: '"impact":"blocked"' } } }),
    ]);
    return realmJsonResponse(trace, evaluateRealmExperiencePilot({ telemetry, readiness, openFeedback, blockedFeedback }), { code: 'realm_experience_scorecard_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải Experience Pilot scorecard.',
      fallbackCode: 'realm_experience_scorecard_error',
    });
  }
}
