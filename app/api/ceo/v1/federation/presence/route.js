import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { CEO_FEDERATION_VERSION, CeoFederationError } from '@/lib/ceo-federation';
import { assertCeoFederationHeaders, buildLocalCeoFederationPresence } from '@/lib/ceo-federation-target-admin';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Authorization', 'X-CEO-Federation-Version': String(CEO_FEDERATION_VERSION), 'X-Content-Type-Options': 'nosniff' };

export async function GET(request) {
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.FEDERATION_READ, headers);
  if (service.response) return service.response;
  const user = service.user;
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    assertCeoFederationHeaders(request, capabilities.entity.id);
    return NextResponse.json(await buildLocalCeoFederationPresence(prisma, user, capabilities.entity), { headers: service.responseHeaders });
  } catch (error) {
    const known = error instanceof CeoFederationError;
    if (!known) console.error('ceo_federation_presence_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: known ? error.message : 'Federation presence is unavailable.', code: known ? error.code : 'ceo_federation_presence_unavailable' }, { status: known ? error.status : 503, headers: service.responseHeaders });
  }
}
