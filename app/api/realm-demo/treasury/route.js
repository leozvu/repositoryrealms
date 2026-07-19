import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { notify } from '@/lib/events';
import { RealmOperationError } from '@/lib/realm-erp-adapter';
import {
  equipRealmTavernItem,
  loadRealmTreasuryDashboard,
  markRealmTavernRedemptionFulfilled,
  requestRealmTreasuryRedemption,
} from '@/lib/realm-treasury-admin';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';
import { loadRealmPilotDecision } from '@/lib/realm-pilot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function integrationDisabled(trace) {
  return realmJsonResponse(trace, {
    error: 'Tavern chưa được kết nối ERP.',
    code: 'realm_erp_sync_disabled',
    source: 'local',
  }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled' });
}

async function authorizedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Tài khoản freelancer chưa tham gia chương trình Gold.', 403, 'freelancer_forbidden');
  const decision = await loadRealmPilotDecision(prisma, user);
  if (!decision.allowed) throw new RealmOperationError(decision.reason, 403, decision.code);
  if (!decision.config.features.tavern) throw new RealmOperationError('Tavern đang tạm tắt theo release policy.', 503, 'realm_tavern_disabled');
  return user;
}

function errorResponse(trace, error) {
  return realmErrorResponse(trace, error, { fallbackMessage: 'Không thể xử lý Tavern.', fallbackCode: 'realm_treasury_error' });
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.tavern', operation: 'dashboard.read' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const user = await authorizedUser();
    return realmJsonResponse(trace, await loadRealmTreasuryDashboard(prisma, user), { code: 'realm_tavern_ready' });
  } catch (error) {
    return errorResponse(trace, error);
  }
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.tavern', operation: 'dashboard.write' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') return integrationDisabled(trace);
  try {
    const user = await authorizedUser();
    let body;
    try {
      body = await request.json();
    } catch {
      throw new RealmOperationError('Payload không hợp lệ.', 400, 'invalid_json');
    }
    let result;
    if (body?.action === 'redeem') {
      result = await requestRealmTreasuryRedemption(prisma, user, {
        itemId: body.itemId,
        idempotencyKey: request.headers.get('Idempotency-Key') || body.idempotencyKey,
      });
    } else if (body?.action === 'equip') {
      result = await equipRealmTavernItem(prisma, user, {
        itemId: body.itemId,
        idempotencyKey: request.headers.get('Idempotency-Key') || body.idempotencyKey,
      });
    } else if (body?.action === 'fulfill') {
      result = await markRealmTavernRedemptionFulfilled(prisma, user, { approvalId: body.approvalId });
      if (!result.idempotent) {
        await notify(result.request.requesterId, `Tavern Keeper đã trao: ${result.request.itemName}`, '/realm');
      }
    } else {
      throw new RealmOperationError('Tavern action không được hỗ trợ.', 400, 'unsupported_treasury_action');
    }
    await safelyPublishRealmChange(prisma, {
      resource: 'realm_treasury',
      action: body?.action || 'update',
      entityId: result?.entry?.id || result?.approval?.id || result?.receipt?.id || null,
      actorId: user.id,
    });
    const dashboard = await loadRealmTreasuryDashboard(prisma, user);
    return realmJsonResponse(trace, {
      ...dashboard,
      action: result.type === 'fulfillment' ? {
        type: 'fulfillment',
        outcome: 'fulfilled',
        idempotent: result.idempotent,
        receiptId: result.receipt.id,
        approvalId: result.approval.id,
      } : result.type === 'equip' ? {
        type: 'equip',
        outcome: 'equipped',
        idempotent: result.idempotent,
        entryId: result.entry.id,
        itemId: result.item.id,
      } : {
        type: result.type,
        idempotent: result.idempotent,
        entryId: result.entry.id,
        approvalId: result.approval?.id || null,
      },
    }, { code: 'realm_tavern_action_applied' });
  } catch (error) {
    return errorResponse(trace, error);
  }
}
