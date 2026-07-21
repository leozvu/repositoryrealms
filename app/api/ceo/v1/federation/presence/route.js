import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/apiauth';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { CEO_FEDERATION_VERSION, CeoFederationError } from '@/lib/ceo-federation';
import { assertCeoFederationHeaders, buildLocalCeoFederationPresence } from '@/lib/ceo-federation-target-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Authorization', 'X-CEO-Federation-Version': String(CEO_FEDERATION_VERSION), 'X-Content-Type-Options': 'nosniff' };

export async function GET(request) {
  const user = await apiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    assertCeoFederationHeaders(request, capabilities.entity.id);
    return NextResponse.json(await buildLocalCeoFederationPresence(prisma, user, capabilities.entity), { headers });
  } catch (error) {
    const known = error instanceof CeoFederationError;
    if (!known) console.error('ceo_federation_presence_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: known ? error.message : 'Federation presence is unavailable.', code: known ? error.code : 'ceo_federation_presence_unavailable' }, { status: known ? error.status : 503, headers });
  }
}
