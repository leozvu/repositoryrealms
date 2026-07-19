import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { loadRealmCompanyModules, realmSurfaceDecision } from '@/lib/realm-access';
import { loadRealmChronicle } from '@/lib/realm-chronicle-admin';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.chronicle', operation: 'self.read' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') {
    return realmJsonResponse(trace, {
      error: 'Adventurer Chronicle chưa được kết nối ERP.',
      code: 'realm_erp_sync_disabled',
    }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled' });
  }
  try {
    const user = await currentUser();
    if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
    if (isFreelancer(user)) throw new RealmOperationError('Chronicle nội bộ không khả dụng cho freelancer.', 403, 'freelancer_forbidden');
    const access = realmSurfaceDecision(user, 'personal', await loadRealmCompanyModules(prisma));
    if (!access.allowed) throw new RealmOperationError(access.reason, 403, access.code);
    return realmJsonResponse(trace, await loadRealmChronicle(prisma, user), { code: 'realm_chronicle_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải Adventurer Chronicle.',
      fallbackCode: 'realm_chronicle_error',
    });
  }
}
