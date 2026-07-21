import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { emitEvent } from '@/lib/events';
import { loadRealmCompanyModules, realmSurfaceDecision } from '@/lib/realm-access';
import { RealmOperationError } from '@/lib/realm-operation';
import { executeRepositoryRealmsAction, repositoryRealmsSurface } from '@/lib/repository-realms';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function integrationDisabled(trace) {
  return realmJsonResponse(trace, {
    error: 'Realm command bridge chưa được kết nối ERP.',
    code: 'realm_erp_sync_disabled',
  }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled' });
}

async function authorizedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Freelancer không có quyền phát lệnh Realm nội bộ.', 403, 'freelancer_forbidden');
  return user;
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.actions', operation: 'record.action' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 4096) throw new RealmOperationError('Payload vượt giới hạn cho phép.', 413, 'realm_action_payload_too_large');
    const user = await authorizedUser();
    let body;
    try {
      body = await request.json();
    } catch {
      throw new RealmOperationError('Payload JSON không hợp lệ.', 400, 'invalid_json');
    }
    const access = realmSurfaceDecision(user, repositoryRealmsSurface(body?.action), await loadRealmCompanyModules(prisma));
    if (!access.allowed) throw new RealmOperationError(access.reason, 403, access.code);
    const result = await executeRepositoryRealmsAction(prisma, user, {
      ...body,
      idempotencyKey: request.headers.get('Idempotency-Key') || body?.idempotencyKey,
    });
    if (!result.idempotent) {
      await emitEvent(result.resource, result.event || 'update', result.updated, result.before, user);
    }
    return realmJsonResponse(trace, {
      source: 'erp',
      idempotent: result.idempotent,
      action: result.action,
      repository: result.repository,
      generatedAt: new Date().toISOString(),
    }, { code: result.idempotent ? 'realm_action_replayed' : 'realm_action_applied' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể cập nhật bản ghi ERP từ Realm.',
      fallbackCode: 'realm_action_error',
    });
  }
}
