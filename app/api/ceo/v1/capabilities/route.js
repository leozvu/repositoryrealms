import { NextResponse } from 'next/server';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { CEO_CONTRACT_VERSION } from '@/lib/ceo-entity-contract';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization',
  'X-CEO-Contract-Version': CEO_CONTRACT_VERSION,
};

export async function GET(req) {
  const service = await ceoServiceGuard(req, CEO_SERVICE_SCOPES.CAPABILITIES_READ, headers);
  if (service.response) return service.response;

  try {
    return NextResponse.json(await loadCeoCapabilities(), { headers: service.responseHeaders });
  } catch (error) {
    console.error('ceo_capabilities_failed', error);
    return NextResponse.json({ error: 'CEO capabilities unavailable', code: 'ceo_capabilities_unavailable' }, { status: 503, headers: service.responseHeaders });
  }
}
