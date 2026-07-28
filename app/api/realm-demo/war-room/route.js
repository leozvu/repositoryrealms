import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { RealmOperationError } from '@/lib/realm-erp-adapter';
import { loadRealmWarRoomDashboard } from '@/lib/realm-war-room-admin';
import { loadRealmCompanyModules, realmSurfaceDecision } from '@/lib/realm-access';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function integrationDisabled(trace) {
  return realmJsonResponse(trace, {
    error: 'War Room chưa được kết nối ERP.',
    code: 'realm_erp_sync_disabled',
    source: 'local',
  }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled' });
}

async function authorizedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Freelancer không có quyền mở War Room nội bộ.', 403, 'freelancer_forbidden');
  return user;
}

function errorResponse(trace, error) {
  return realmErrorResponse(trace, error, { fallbackMessage: 'Không thể tải War Room.', fallbackCode: 'realm_war_room_error' });
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.war-room', operation: 'dashboard.read' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (!projectId) throw new RealmOperationError('Hãy chọn một chiến dịch từ Guild Hall.', 400, 'campaign_required');
    const user = await authorizedUser();
    const access = realmSurfaceDecision(user, 'campaigns', await loadRealmCompanyModules(prisma));
    if (!access.allowed) throw new RealmOperationError(access.reason, 403, access.code);
    return realmJsonResponse(trace, await loadRealmWarRoomDashboard(prisma, user, projectId), { code: 'realm_war_room_ready' });
  } catch (error) {
    return errorResponse(trace, error);
  }
}
