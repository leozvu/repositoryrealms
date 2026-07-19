import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { loadRealmChangeFeed } from '@/lib/realm-change-feed';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.changes', operation: 'feed.read' });
  if (process.env.REALM_ERP_SYNC_ENABLED !== '1') {
    return realmJsonResponse(trace, {
      status: 'disabled',
      code: 'realm_erp_sync_disabled',
    }, { status: 503, code: 'realm_erp_sync_disabled', outcome: 'disabled', headers: { 'Retry-After': '30' } });
  }
  try {
    const user = await currentUser();
    if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
    if (isFreelancer(user)) throw new RealmOperationError('Freelancer không thuộc change-feed nội bộ.', 403, 'freelancer_forbidden');
    const cursor = new URL(request.url).searchParams.get('cursor');
    if (cursor && cursor.length > 500) throw new RealmOperationError('Cursor change-feed quá dài.', 400, 'realm_change_cursor_invalid');
    const feed = await loadRealmChangeFeed(prisma, user, { cursor });
    return realmJsonResponse(trace, feed, { code: feed.changed ? 'realm_changes_ready' : 'realm_changes_idle' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể đọc Realm change-feed.',
      fallbackCode: 'realm_change_feed_error',
      retryAfter: 5,
    });
  }
}
