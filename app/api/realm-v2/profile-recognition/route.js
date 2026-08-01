import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFreelancer } from '@/lib/perm';
import { loadRealmCompanyModules, realmSurfaceDecision } from '@/lib/realm-access';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { RealmOperationError } from '@/lib/realm-operation';
import { loadRealmProfileRecognition } from '@/lib/realm-profile-recognition-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.v2.profile-recognition', operation: 'self.read' });
  try {
    const user = await currentUser();
    if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
    if (isFreelancer(user)) throw new RealmOperationError('Hồ sơ Realm nội bộ không khả dụng cho freelancer.', 403, 'freelancer_forbidden');
    const access = realmSurfaceDecision(user, 'personal', await loadRealmCompanyModules(prisma));
    if (!access.allowed) throw new RealmOperationError(access.reason, 403, access.code);
    return realmJsonResponse(trace, await loadRealmProfileRecognition(prisma, user), { code: 'realm_profile_recognition_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải hồ sơ và sổ ghi nhận cá nhân.',
      fallbackCode: 'realm_profile_recognition_error',
    });
  }
}
