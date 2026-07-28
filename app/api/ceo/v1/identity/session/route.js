import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { CEO_PORTAL_SESSION_TTL_MS, ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { bootstrapCeoPortalSession, readCeoIdentityState } from '@/lib/ceo-identity-admin';
import { ceoIdentityErrorResponse, ceoIdentityJson, ceoRequestContext, readCeoPortalSessionCookie, setCeoPortalSessionCookie } from '@/lib/ceo-identity-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function director() {
  const user = await currentUser();
  if (!user) return { response: ceoIdentityJson({ error: 'unauthorized', code: 'unauthorized' }, 401) };
  if (!isDirector(user)) return { response: ceoIdentityJson({ error: 'forbidden', code: 'ceo_identity_director_required' }, 403) };
  return { user };
}

export async function GET(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  try {
    const hashSecret = ceoIdentityHashSecret();
    return ceoIdentityJson(await readCeoIdentityState(prisma, auth.user, readCeoPortalSessionCookie(request), ceoRequestContext(request, hashSecret)));
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_identity_state_failed');
  }
}

export async function POST(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoIdentityJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    const hashSecret = ceoIdentityHashSecret();
    const created = await bootstrapCeoPortalSession(prisma, auth.user, body, ceoRequestContext(request, hashSecret));
    const response = ceoIdentityJson({ ok: true, identity: { subject: created.identity.subject }, session: created.session });
    return setCeoPortalSessionCookie(response, request, created.token, CEO_PORTAL_SESSION_TTL_MS / 1000);
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_identity_bootstrap_failed');
  }
}
