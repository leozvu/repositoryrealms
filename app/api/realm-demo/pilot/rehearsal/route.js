import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { safelyPublishRealmChange } from '@/lib/realm-change-feed';
import {
  createRealmPilotRehearsal,
  loadRealmPilotRehearsalDashboard,
  transitionRealmPilotRehearsal,
} from '@/lib/realm-pilot-rehearsal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authenticatedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  return user;
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.pilot.rehearsal', operation: 'pilot.rehearsal.read' });
  try {
    const user = await authenticatedUser();
    const dashboard = await loadRealmPilotRehearsalDashboard(prisma, user);
    return realmJsonResponse(trace, dashboard, { code: 'realm_pilot_rehearsal_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải launch rehearsal.',
      fallbackCode: 'realm_pilot_rehearsal_error',
    });
  }
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.pilot.rehearsal', operation: 'pilot.rehearsal.write' });
  try {
    const user = await authenticatedUser();
    const body = await request.json().catch(() => ({}));
    const result = body.action === 'create'
      ? await createRealmPilotRehearsal(prisma, user, body)
      : await transitionRealmPilotRehearsal(prisma, user, body);
    await safelyPublishRealmChange(prisma, {
      resource: 'settings',
      action: body.action || 'update',
      entityId: result.run?.id,
      actorId: user.id,
    });
    const dashboard = await loadRealmPilotRehearsalDashboard(prisma, user);
    return realmJsonResponse(trace, { ok: true, ...dashboard }, { code: 'realm_pilot_rehearsal_updated' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể cập nhật launch rehearsal.',
      fallbackCode: 'realm_pilot_rehearsal_update_error',
    });
  }
}
