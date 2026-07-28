import { NextResponse } from 'next/server';
import { loadCeoHealth } from '@/lib/ceo-entity-admin';
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
  const service = await ceoServiceGuard(req, CEO_SERVICE_SCOPES.HEALTH_READ, headers);
  if (service.response) return service.response;

  try {
    const payload = await loadCeoHealth();
    return NextResponse.json(payload, { status: payload.status === 'ready' ? 200 : 503, headers: service.responseHeaders });
  } catch (error) {
    console.error('ceo_health_failed', error);
    return NextResponse.json({ error: 'CEO entity health unavailable', code: 'ceo_health_unavailable' }, { status: 503, headers: service.responseHeaders });
  }
}
