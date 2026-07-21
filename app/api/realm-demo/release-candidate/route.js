import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector, isFreelancer } from '@/lib/perm';
import { RealmOperationError } from '@/lib/realm-operation';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';
import { loadRealmReleaseCandidateDossier } from '@/lib/realm-release-candidate-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authorizedDirector() {
  const user = await currentUser();
  if (!user) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user)) throw new RealmOperationError('Realm pilot chỉ dành cho nhân sự nội bộ.', 403, 'freelancer_forbidden');
  if (!isDirector(user)) throw new RealmOperationError('Chỉ Giám đốc được xem Release Candidate dossier.', 403, 'realm_release_candidate_forbidden');
  return user;
}

export async function GET(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.release-candidate', operation: 'release-candidate.read' });
  try {
    const user = await authorizedDirector();
    const dossier = await loadRealmReleaseCandidateDossier(prisma, user);
    return realmJsonResponse(trace, dossier, { code: 'realm_release_candidate_ready' });
  } catch (error) {
    return realmErrorResponse(trace, error, {
      fallbackMessage: 'Không thể tải Release Candidate dossier.',
      fallbackCode: 'realm_release_candidate_error',
    });
  }
}
