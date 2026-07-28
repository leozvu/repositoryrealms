import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { revokeCeoPortalSession } from '@/lib/ceo-identity-admin';
import { ceoIdentityErrorResponse, ceoIdentityJson, ceoRequestContext, clearCeoPortalSessionCookie, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return ceoIdentityJson({ error: 'unauthorized', code: 'unauthorized' }, 401);
  if (!ceoRequestIsSameOrigin(request)) return ceoIdentityJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const hashSecret = ceoIdentityHashSecret();
    const result = await revokeCeoPortalSession(prisma, user, readCeoPortalSessionCookie(request), params.id, ceoRequestContext(request, hashSecret));
    const response = ceoIdentityJson(result);
    return result.currentRevoked ? clearCeoPortalSessionCookie(response, request) : response;
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_session_revoke_failed');
  }
}
