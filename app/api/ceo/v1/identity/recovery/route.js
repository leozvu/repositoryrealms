import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { rotateCeoRecoveryCodes } from '@/lib/ceo-identity-admin';
import { ceoIdentityErrorResponse, ceoIdentityJson, ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const user = await currentUser();
  if (!user) return ceoIdentityJson({ error: 'unauthorized', code: 'unauthorized' }, 401);
  if (!ceoRequestIsSameOrigin(request)) return ceoIdentityJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const hashSecret = ceoIdentityHashSecret();
    return ceoIdentityJson(await rotateCeoRecoveryCodes(prisma, user, readCeoPortalSessionCookie(request), ceoRequestContext(request, hashSecret)));
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_recovery_rotation_failed');
  }
}
