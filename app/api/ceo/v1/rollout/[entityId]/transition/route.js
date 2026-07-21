import { prisma } from '@/lib/prisma';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import { transitionCeoRollout } from '@/lib/ceo-rollout-admin';
import { ceoRolloutDirector, ceoRolloutErrorResponse, ceoRolloutJson } from '@/lib/ceo-rollout-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const auth = await ceoRolloutDirector();
  if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoRolloutJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    const context = ceoRequestContext(request, ceoIdentityHashSecret());
    return ceoRolloutJson(await transitionCeoRollout(prisma, auth.user, readCeoPortalSessionCookie(request), params.entityId, body, context));
  } catch (error) {
    return ceoRolloutErrorResponse(error, 'ceo_rollout_transition_failed');
  }
}
