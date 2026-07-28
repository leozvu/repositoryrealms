import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { loadRealmCompanyModules } from '@/lib/realm-access';
import {
  RealmOperationError,
  claimRealmTaskReward,
  loadRealmErpSnapshot,
  updateRealmErpProfile,
} from '@/lib/realm-erp-adapter';
import { realmSnapshotHeaders, realmSnapshotMatchesEtag } from '@/lib/realm-sync';
import { realmEmptyResponse, realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function snapshotResponse(trace, snapshot, body = snapshot) {
  return realmJsonResponse(trace, body, { code: 'realm_snapshot_ready', headers: realmSnapshotHeaders(snapshot.sync) });
}

function integrationDisabled(trace) {
  return realmJsonResponse(trace, {
    error: 'Realm ERP sync chưa được bật.',
    code: 'realm_erp_sync_disabled',
    source: 'local',
  }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled', headers: { 'Retry-After': '30' } });
}

async function authorizedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Tài khoản freelancer chưa được tham gia Realm rewards.', 403, 'freelancer_forbidden');
  return user;
}

function errorResponse(trace, error) {
  return realmErrorResponse(trace, error, {
    fallbackMessage: 'Không thể đồng bộ Realm với ERP.',
    fallbackCode: 'realm_erp_sync_error',
    retryAfter: 5,
  });
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.operations', operation: 'snapshot.read' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const user = await authorizedUser();
    const snapshot = await loadRealmErpSnapshot(prisma, user);
    if (realmSnapshotMatchesEtag(request?.headers?.get('If-None-Match'), snapshot.sync)) {
      return realmEmptyResponse(trace, { status: 304, code: 'realm_snapshot_not_modified', headers: realmSnapshotHeaders(snapshot.sync) });
    }
    return snapshotResponse(trace, snapshot);
  } catch (error) {
    return errorResponse(trace, error);
  }
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.operations', operation: 'snapshot.write' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const user = await authorizedUser();
    let body;
    try {
      body = await request.json();
    } catch {
      throw new RealmOperationError('Payload không hợp lệ.', 400, 'invalid_json');
    }
    let action;
    let change;
    if (body?.action === 'claim-reward') {
      const modules = await loadRealmCompanyModules(prisma);
      const result = await claimRealmTaskReward(prisma, user, {
        taskId: body.taskId,
        idempotencyKey: request.headers.get('Idempotency-Key') || body.idempotencyKey,
        modules,
      });
      action = { type: body.action, idempotent: result.idempotent, entryId: result.entry.id };
      change = { resource: 'realm_gold', action: 'claim', entityId: result.entry.id, actorId: user.id };
    } else if (body?.action === 'update-profile') {
      await updateRealmErpProfile(prisma, user, body.profile, { expectedProfileVersion: body.profileVersion });
      action = { type: body.action, idempotent: false };
      change = { resource: 'realm_profile', action: 'update', entityId: user.id, actorId: user.id };
    } else {
      throw new RealmOperationError('Action không được hỗ trợ.', 400, 'unsupported_action');
    }
    await safelyPublishRealmChange(prisma, change);
    const snapshot = await loadRealmErpSnapshot(prisma, user);
    return snapshotResponse(trace, snapshot, { ...snapshot, action });
  } catch (error) {
    return errorResponse(trace, error);
  }
}
