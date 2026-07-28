import { prisma } from '@/lib/prisma';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import { recordCeoRolloutEvidence } from '@/lib/ceo-rollout-admin';
import { ceoRolloutDirector, ceoRolloutErrorResponse, ceoRolloutJson } from '@/lib/ceo-rollout-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await ceoRolloutDirector();
  if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoRolloutJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    const { entityId, ...evidence } = body;
    const context = ceoRequestContext(request, ceoIdentityHashSecret());
    return ceoRolloutJson(await recordCeoRolloutEvidence(prisma, auth.user, readCeoPortalSessionCookie(request), entityId, evidence, context), 201);
  } catch (error) {
    return ceoRolloutErrorResponse(error, 'ceo_rollout_evidence_failed');
  }
}
