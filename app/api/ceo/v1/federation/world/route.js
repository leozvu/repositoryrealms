import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ceoIdentityHashSecret } from '@/lib/ceo-identity';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import { CEO_FEDERATION_VERSION, CeoFederationError } from '@/lib/ceo-federation';
import { loadCeoFederationWorld } from '@/lib/ceo-federation-admin';
import { isDirector } from '@/lib/perm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Cookie', 'X-CEO-Federation-Version': String(CEO_FEDERATION_VERSION), 'X-Content-Type-Options': 'nosniff' };

export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  if (!isDirector(user)) return NextResponse.json({ error: 'forbidden', code: 'ceo_federation_director_required' }, { status: 403, headers });
  try {
    const context = ceoRequestContext(request, ceoIdentityHashSecret());
    const body = await loadCeoFederationWorld(prisma, user, readCeoPortalSessionCookie(request), { entityId: request.nextUrl.searchParams.get('entity') || 'all' }, context);
    return NextResponse.json(body, { headers });
  } catch (error) {
    const known = error instanceof CeoFederationError || error?.name === 'CeoIdentityError';
    if (!known) console.error('ceo_federation_world_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: known ? error.message : 'Federation world is unavailable.', code: known ? error.code : 'ceo_federation_world_unavailable' }, { status: known ? error.status : 503, headers });
  }
}
