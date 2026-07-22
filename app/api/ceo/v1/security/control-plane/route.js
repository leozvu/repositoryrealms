import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { readCeoSecurityPosture, suspendCeoPortalControlPlane } from '@/lib/ceo-identity-admin';
import { ceoIdentityErrorResponse, ceoIdentityJson, ceoRequestContext, clearCeoPortalSessionCookie, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function director() {
  const user = await currentUser();
  if (!user) return { response: ceoIdentityJson({ error: 'unauthorized', code: 'unauthorized' }, 401) };
  if (!isDirector(user)) return { response: ceoIdentityJson({ error: 'forbidden', code: 'ceo_security_director_required' }, 403) };
  return { user };
}

export async function GET() {
  const auth = await director();
  if (auth.response) return auth.response;
  try {
    return ceoIdentityJson(await readCeoSecurityPosture(prisma, auth.user, { secretResolver: (name) => process.env[name] }));
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_security_posture_failed');
  }
}

export async function POST(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoIdentityJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    const result = await suspendCeoPortalControlPlane(
      prisma,
      auth.user,
      readCeoPortalSessionCookie(request),
      body,
      ceoRequestContext(request, ceoIdentityHashSecret()),
    );
    return clearCeoPortalSessionCookie(ceoIdentityJson(result), request);
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_control_plane_suspend_failed');
  }
}
