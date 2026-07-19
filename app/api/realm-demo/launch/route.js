import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createRealmLaunchPreview } from '@/lib/realm-launch';
import { realmLaunchSecret } from '@/lib/realm-launch-token';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.launch', operation: 'pilot.preview' });
  try {
    const user = await currentUser();
    if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
    const body = await request.json().catch(() => ({}));
    const result = await createRealmLaunchPreview(prisma, user, body.policy, { secret: realmLaunchSecret() });
    return realmJsonResponse(trace, result, { code: 'realm_launch_preview_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể chạy dry-run phát hành Realm.',
      fallbackCode: 'realm_launch_preview_error',
    });
  }
}
