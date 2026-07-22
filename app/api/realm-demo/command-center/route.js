import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { notify } from '@/lib/events';
import { notificationRecordRoute } from '@/lib/notification-inbox';
import { loadRealmCompanyModules, realmSurfaceDecision } from '@/lib/realm-access';
import { loadRealmCommandCenter, requestRealmTaskHandoff } from '@/lib/realm-command-center-admin';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function integrationDisabled(trace) {
  return realmJsonResponse(trace, {
    error: 'Royal Command Center chưa được kết nối ERP.',
    code: 'realm_erp_sync_disabled',
  }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled' });
}

async function authorizedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Freelancer không có quyền mở Royal Command Center nội bộ.', 403, 'freelancer_forbidden');
  const access = realmSurfaceDecision(user, 'command', await loadRealmCompanyModules(prisma));
  if (!access.allowed) throw new RealmOperationError(access.reason, 403, access.code);
  return user;
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.command-center', operation: 'dashboard.read' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const user = await authorizedUser();
    return realmJsonResponse(trace, await loadRealmCommandCenter(prisma, user), { code: 'realm_command_center_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải Royal Command Center.',
      fallbackCode: 'realm_command_center_error',
    });
  }
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.command-center', operation: 'handoff.request' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 4096) throw new RealmOperationError('Payload vượt giới hạn cho phép.', 413, 'realm_handoff_payload_too_large');
    const user = await authorizedUser();
    let body;
    try { body = await request.json(); } catch {
      throw new RealmOperationError('Payload JSON không hợp lệ.', 400, 'invalid_json');
    }
    if (body?.action !== 'task.handoff.request') {
      throw new RealmOperationError('Royal Command action chưa được cho phép.', 400, 'realm_command_action_unsupported');
    }
    const result = await requestRealmTaskHandoff(prisma, user, body);
    await notify(result.approverIds, `Chờ bạn duyệt: ${result.approval.title}`, notificationRecordRoute('approvals', result.approval.id));
    await safelyPublishRealmChange(prisma, {
      resource: 'approvals', action: 'create', entityId: result.approval.id, actorId: user.id,
    });
    return realmJsonResponse(trace, {
      source: 'erp',
      approval: result.approval,
      generatedAt: new Date().toISOString(),
    }, { status: 201, code: 'realm_handoff_requested' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể gửi yêu cầu bàn giao.',
      fallbackCode: 'realm_handoff_error',
    });
  }
}
