import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { safeRealmException, startRealmApiRequest } from '@/lib/realm-observability';
import {
  inspectRealmSchemaReadiness,
} from '@/lib/realm-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.health', operation: 'readiness.check' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') {
    return realmJsonResponse(trace, {
      status: 'disabled',
      service: 'realm-erp-sync',
      code: 'realm_erp_sync_disabled',
    }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled', headers: { 'Retry-After': '30' } });
  }

  try {
    const user = await currentUser();
    if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
    const readiness = await inspectRealmSchemaReadiness(prisma);
    if (!readiness.ready) {
      throw new RealmOperationError(
        `Realm staging schema chưa sẵn sàng: ${readiness.missing.join(', ')}.`,
        503,
        'realm_schema_not_ready',
      );
    }
    return realmJsonResponse(trace, {
      status: 'ready',
      service: 'realm-erp-sync',
      integration: 'enabled',
      database: 'reachable',
      migration: 'ready',
      schemaVersion: readiness.schemaVersion,
      checkedAt: new Date().toISOString(),
    }, { code: 'realm_health_ready' });
  } catch (error) {
    if (error instanceof RealmOperationError) {
      return realmErrorResponse(trace, error, { fallbackMessage: 'Không thể kiểm tra Realm health.', fallbackCode: 'realm_health_error' });
    }
    safeRealmException(trace, error, 'realm_database_unreachable');
    return realmJsonResponse(trace, {
      status: 'degraded',
      service: 'realm-erp-sync',
      database: 'unreachable',
      code: 'realm_database_unreachable',
    }, { status: 503, code: 'realm_database_unreachable', outcome: 'error', headers: { 'Retry-After': '5' } });
  }
}
