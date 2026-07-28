import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { RealmOperationError } from '@/lib/realm-erp-adapter';
import { applyRealmRewardAdminAction, loadRealmRewardDashboard } from '@/lib/realm-reward-admin';
import { loadRealmCompanyModules, realmSurfaceDecision } from '@/lib/realm-access';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function integrationDisabled(trace) {
  return realmJsonResponse(trace, {
    error: 'Reward Control Center chưa được kết nối ERP.',
    code: 'realm_erp_sync_disabled',
    source: 'local',
  }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled' });
}

async function authorizedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Freelancer không có quyền quản trị Realm rewards.', 403, 'freelancer_forbidden');
  return user;
}

function errorResponse(trace, error) {
  return realmErrorResponse(trace, error, { fallbackMessage: 'Không thể xử lý Reward Control Center.', fallbackCode: 'realm_reward_admin_error' });
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.rewards', operation: 'dashboard.read' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const user = await authorizedUser();
    const access = realmSurfaceDecision(user, 'rewards', await loadRealmCompanyModules(prisma));
    if (!access.allowed) throw new RealmOperationError(access.reason, 403, access.code);
    return realmJsonResponse(trace, await loadRealmRewardDashboard(prisma, user), { code: 'realm_rewards_ready' });
  } catch (error) {
    return errorResponse(trace, error);
  }
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.rewards', operation: 'dashboard.write' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const user = await authorizedUser();
    const access = realmSurfaceDecision(user, 'rewards', await loadRealmCompanyModules(prisma));
    if (!access.allowed) throw new RealmOperationError(access.reason, 403, access.code);
    let body;
    try {
      body = await request.json();
    } catch {
      throw new RealmOperationError('Payload không hợp lệ.', 400, 'invalid_json');
    }
    const action = await applyRealmRewardAdminAction(prisma, user, body);
    await safelyPublishRealmChange(prisma, {
      resource: 'realm_rewards',
      action: body?.action || 'update',
      entityId: body?.taskId || body?.budgetId || action?.id || null,
      actorId: user.id,
    });
    const dashboard = await loadRealmRewardDashboard(prisma, user);
    return realmJsonResponse(trace, { ...dashboard, action }, { code: 'realm_reward_action_applied' });
  } catch (error) {
    return errorResponse(trace, error);
  }
}
