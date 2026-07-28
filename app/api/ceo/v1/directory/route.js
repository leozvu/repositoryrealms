import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { buildLocalCeoDirectory } from '@/lib/ceo-messaging-target-admin';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request) {
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.DIRECTORY_READ, headers);
  if (service.response) return service.response;
  const user = service.user;
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    return NextResponse.json(await buildLocalCeoDirectory(prisma, user, capabilities.entity), { headers: service.responseHeaders });
  } catch (error) {
    const known = error?.name === 'CeoMessagingError';
    return NextResponse.json({ error: known ? error.message : 'Directory service is unavailable.', code: known ? error.code : 'ceo_messaging_directory_unavailable' }, { status: known ? error.status : 503, headers: service.responseHeaders });
  }
}
