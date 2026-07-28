import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import {
  loadRealmPilotDecision,
  loadRealmPilotDirectory,
  loadRealmPilotMetrics,
  publicRealmPilotConfig,
  saveRealmPilotConfig,
  saveRealmWorkspacePreference,
} from '@/lib/realm-pilot';
import { RealmOperationError } from '@/lib/realm-operation';
import { verifyRealmLaunchApplication } from '@/lib/realm-launch';
import { realmLaunchSecret } from '@/lib/realm-launch-token';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authenticatedUser() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  return user;
}

function safeDecision(decision) {
  return {
    allowed: decision.allowed,
    code: decision.code,
    reason: decision.reason,
    preference: decision.preference,
    resolvedSurface: decision.resolvedSurface,
  };
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.pilot', operation: 'pilot.read' });
  try {
    const user = await authenticatedUser();
    const decision = await loadRealmPilotDecision(prisma, user);
    const director = isDirector(user);
    const [metrics, directory] = director
      ? await Promise.all([loadRealmPilotMetrics(prisma, decision.config), loadRealmPilotDirectory(prisma)])
      : [null, null];
    return realmJsonResponse(trace, {
      source: 'erp',
      user: safeDecision(decision),
      policy: director ? decision.config : publicRealmPilotConfig(decision.config),
      metrics,
      directory,
      privacy: metrics?.privacy || {
        aggregateOnly: true,
        performanceTracking: false,
        durationTracking: false,
      },
    }, { code: 'realm_pilot_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải cấu hình Realm pilot.',
      fallbackCode: 'realm_pilot_error',
    });
  }
}

export async function PUT(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.pilot', operation: 'preference.update' });
  try {
    const user = await authenticatedUser();
    const body = await request.json().catch(() => ({}));
    const decision = await saveRealmWorkspacePreference(prisma, user, body.preference);
    return realmJsonResponse(trace, { ok: true, user: safeDecision(decision) }, { code: 'realm_preference_updated' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể lưu lựa chọn giao diện.',
      fallbackCode: 'realm_preference_error',
    });
  }
}

export async function PATCH(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.pilot', operation: 'pilot.update' });
  try {
    const user = await authenticatedUser();
    const body = await request.json().catch(() => ({}));
    const launchSecret = body.policy?.mode === 'off' ? '' : realmLaunchSecret();
    const policy = await saveRealmPilotConfig(prisma, user, body.policy, {
      requireLaunchPreview: true,
      verifyLaunchPreview: body.policy?.mode === 'off' ? null : async ({ db, currentPolicy, draftPolicy }) => {
        const preview = await verifyRealmLaunchApplication(db, user, {
          token: body.launchPreviewToken,
          currentPolicy,
          draftPolicy,
          secret: launchSecret,
        });
        if (preview.risk === 'expansion') {
          throw new RealmOperationError('Mở rộng Realm cần một Director khác phê duyệt.', 409, 'realm_launch_approval_required');
        }
        return preview;
      },
    });
    const [metrics, directory] = await Promise.all([
      loadRealmPilotMetrics(prisma, policy),
      loadRealmPilotDirectory(prisma),
    ]);
    return realmJsonResponse(trace, { ok: true, policy, metrics, directory }, { code: 'realm_pilot_updated' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể cập nhật Realm pilot.',
      fallbackCode: 'realm_pilot_update_error',
    });
  }
}
