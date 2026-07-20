import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';
import {
  createRealmPilotWave,
  loadRealmPilotOperationsDashboard,
  transitionRealmPilotWave,
} from '@/lib/realm-pilot-operations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authenticatedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  return user;
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.pilot.operations', operation: 'pilot.operations.read' });
  try {
    const user = await authenticatedUser();
    const dashboard = await loadRealmPilotOperationsDashboard(prisma, user);
    return realmJsonResponse(trace, dashboard, { code: 'realm_pilot_operations_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải Pilot Operations.',
      fallbackCode: 'realm_pilot_operations_error',
    });
  }
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.pilot.operations', operation: 'pilot.operations.write' });
  try {
    const user = await authenticatedUser();
    const body = await request.json().catch(() => ({}));
    const result = body.action === 'create'
      ? await createRealmPilotWave(prisma, user, body)
      : await transitionRealmPilotWave(prisma, user, body);
    await safelyPublishRealmChange(prisma, {
      resource: 'settings',
      action: body.action || 'update',
      entityId: result.wave?.id,
      actorId: user.id,
    });
    const dashboard = await loadRealmPilotOperationsDashboard(prisma, user);
    return realmJsonResponse(trace, { ok: true, ...dashboard }, { code: 'realm_pilot_operations_updated' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể cập nhật Pilot Operations.',
      fallbackCode: 'realm_pilot_operations_update_error',
    });
  }
}
