import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { loadRealmPilotDecision } from '@/lib/realm-pilot';
import { loadRealmLaunchReadiness } from '@/lib/realm-readiness';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.readiness', operation: 'pilot.preflight' });
  try {
    const user = await currentUser();
    if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
    if (!isDirector(user)) throw new RealmOperationError('Chỉ Giám đốc được xem release readiness.', 403, 'realm_readiness_forbidden');
    const decision = await loadRealmPilotDecision(prisma, user);
    const readiness = await loadRealmLaunchReadiness(prisma, decision.config);
    return realmJsonResponse(trace, readiness, { code: 'realm_readiness_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể chạy Realm pilot preflight.',
      fallbackCode: 'realm_readiness_error',
    });
  }
}
