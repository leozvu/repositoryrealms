import { prisma } from '@/lib/prisma';
import { listCeoRollout } from '@/lib/ceo-rollout-admin';
import { ceoRolloutDirector, ceoRolloutErrorResponse, ceoRolloutJson } from '@/lib/ceo-rollout-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await ceoRolloutDirector();
  if (auth.response) return auth.response;
  try {
    return ceoRolloutJson(await listCeoRollout(prisma, auth.user));
  } catch (error) {
    return ceoRolloutErrorResponse(error, 'ceo_rollout_read_failed');
  }
}
