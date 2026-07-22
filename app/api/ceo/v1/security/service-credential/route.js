import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { listLocalCeoServiceCredentials, rotateLocalCeoServiceCredential } from '@/lib/ceo-service-credential-admin';
import { ceoIdentityErrorResponse, ceoIdentityJson, ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function director() {
  const user = await currentUser();
  if (!user) return { response: ceoIdentityJson({ error: 'unauthorized', code: 'unauthorized' }, 401) };
  if (!isDirector(user)) return { response: ceoIdentityJson({ error: 'forbidden', code: 'ceo_service_director_required' }, 403) };
  return { user };
}

async function context(request) {
  const capabilities = await loadCeoCapabilities(prisma);
  return {
    audience: capabilities.entity.id,
    requestContext: ceoRequestContext(request, ceoIdentityHashSecret()),
  };
}

export async function GET(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  try {
    const local = await context(request);
    const credentials = await listLocalCeoServiceCredentials(prisma, auth.user, readCeoPortalSessionCookie(request), local.audience, local.requestContext);
    return ceoIdentityJson({ audience: local.audience, credentials });
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_service_credential_list_failed');
  }
}

export async function POST(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoIdentityJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const local = await context(request);
    const body = await request.json().catch(() => ({}));
    return ceoIdentityJson(await rotateLocalCeoServiceCredential(
      prisma,
      auth.user,
      readCeoPortalSessionCookie(request),
      local.audience,
      body,
      local.requestContext,
    ), 201);
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_service_credential_rotation_failed');
  }
}
