import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { requireCeoPortalSession } from '@/lib/ceo-identity-admin';
import { ceoIdentityErrorResponse, ceoIdentityJson, ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import { CEO_SECURITY_CHAOS_SCENARIOS, runCeoSecurityChaosSuite } from '@/lib/ceo-security-chaos';

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
  return ceoIdentityJson({ version: 1, mode: 'dry-run', scenarios: CEO_SECURITY_CHAOS_SCENARIOS, destructive: false });
}

export async function POST(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoIdentityJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const requestContext = ceoRequestContext(request, ceoIdentityHashSecret());
    await requireCeoPortalSession(prisma, auth.user, readCeoPortalSessionCookie(request), { ...requestContext, touch: false });
    const body = await request.json().catch(() => ({}));
    return ceoIdentityJson(runCeoSecurityChaosSuite({ scenarios: body.scenarios || CEO_SECURITY_CHAOS_SCENARIOS }));
  } catch (error) {
    if (error?.name === 'CeoSecurityChaosError') return ceoIdentityJson({ error: error.message, code: error.code }, error.status);
    return ceoIdentityErrorResponse(error, 'ceo_security_rehearsal_failed');
  }
}
