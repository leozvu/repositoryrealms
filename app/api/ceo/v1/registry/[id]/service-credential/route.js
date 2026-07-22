import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { CeoRegistryError } from '@/lib/ceo-entity-registry';
import { rotateCeoRegistryServiceCredential } from '@/lib/ceo-entity-registry-admin';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin, requireCeoStepUp } from '@/lib/ceo-identity';
import { requireCeoPortalSession } from '@/lib/ceo-identity-admin';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  if (!isDirector(user)) return NextResponse.json({ error: 'forbidden', code: 'ceo_registry_director_required' }, { status: 403, headers });
  if (!ceoRequestIsSameOrigin(request)) return NextResponse.json({ error: 'invalid origin', code: 'invalid_origin' }, { status: 403, headers });
  try {
    const requestContext = ceoRequestContext(request, ceoIdentityHashSecret());
    const session = await requireCeoPortalSession(prisma, user, readCeoPortalSessionCookie(request), { ...requestContext, touch: false });
    requireCeoStepUp(session);
    const body = await request.json().catch(() => ({}));
    const entity = await rotateCeoRegistryServiceCredential(prisma, user, params.id, body);
    return NextResponse.json({ ok: true, entity }, { headers });
  } catch (error) {
    if (error instanceof CeoRegistryError || error?.name === 'CeoIdentityError') {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
    }
    console.error('ceo_registry_service_rotation_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: 'CEO service credential rotation failed', code: 'ceo_registry_service_rotation_failed' }, { status: 503, headers });
  }
}
