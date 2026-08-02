import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ceoIdentityHashSecret, CeoIdentityError, requireCeoStepUp } from '@/lib/ceo-identity';
import { requireCeoPortalSession } from '@/lib/ceo-identity-admin';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import { loadCeoUnifiedDecisionQueue } from '@/lib/ceo-decision-queue-admin';
import { CEO_DECISION_QUEUE_VERSION, CeoDecisionQueueError } from '@/lib/ceo-decision-queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
  'X-CEO-Decision-Version': String(CEO_DECISION_QUEUE_VERSION),
};

export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  try {
    const hashSecret = ceoIdentityHashSecret();
    const session = await requireCeoPortalSession(
      prisma, user, readCeoPortalSessionCookie(request), { ...ceoRequestContext(request, hashSecret), touch: false },
    );
    requireCeoStepUp(session);
    return NextResponse.json(await loadCeoUnifiedDecisionQueue(prisma, user, session, {
      entityId: request.nextUrl.searchParams.get('entity') || 'all',
    }), { headers });
  } catch (error) {
    const known = error instanceof CeoDecisionQueueError || error instanceof CeoIdentityError;
    console.error('ceo_decision_queue_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({
      error: known ? error.message : 'Decision queue is unavailable.',
      code: known ? error.code : 'ceo_decision_queue_unavailable',
    }, { status: known ? error.status : 503, headers });
  }
}
