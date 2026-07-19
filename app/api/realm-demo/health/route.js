import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { safeRealmException, startRealmApiRequest } from '@/lib/realm-observability';
import {
  LATEST_REALM_MIGRATION,
  evaluateRealmSchemaReadiness,
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
    const [structure] = await prisma.$queryRaw`
      SELECT
        to_regclass('"User"') IS NOT NULL AS "userTable",
        to_regclass('"CollaborationContactRequest"') IS NOT NULL AS "collaborationTable",
        to_regclass('"RealmChangeEvent"') IS NOT NULL AS "changeFeedTable",
        to_regclass('"RealmActionReceipt"') IS NOT NULL AS "actionReceiptTable",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'User'
            AND column_name = 'workspacePreference'
        ) AS "pilotPreferenceColumn",
        (
          SELECT COUNT(*) = 8 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'Ticket'
            AND column_name IN (
              'reporterId', 'source', 'feedbackType', 'feedbackSurface',
              'feedbackContext', 'feedbackResponse', 'requestKey', 'updatedAt'
            )
        ) AS "pilotFeedbackColumns",
        to_regclass('"_prisma_migrations"') IS NOT NULL AS "migrationTable"
    `;
    let latestMigrationApplied = false;
    if (structure?.migrationTable) {
      const [migration] = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT 1 FROM "_prisma_migrations"
          WHERE migration_name = ${LATEST_REALM_MIGRATION}
            AND finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        ) AS "applied"
      `;
      latestMigrationApplied = Boolean(migration?.applied);
    }
    const readiness = evaluateRealmSchemaReadiness({ ...structure, latestMigrationApplied });
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
