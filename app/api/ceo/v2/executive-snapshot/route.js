import { NextResponse } from 'next/server';
import { loadLocalCeoExecutiveSnapshot } from '@/lib/ceo-executive-target-admin';
import { CEO_EXECUTIVE_CONTRACT_VERSION } from '@/lib/ceo-executive-contract';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = {
  'Cache-Control': 'private, no-store', Vary: 'Authorization',
  'X-CEO-Executive-Version': CEO_EXECUTIVE_CONTRACT_VERSION,
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request) {
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.SNAPSHOT_READ, headers);
  if (service.response) return service.response;
  try {
    return NextResponse.json(await loadLocalCeoExecutiveSnapshot(), { headers: service.responseHeaders });
  } catch (error) {
    console.error('ceo_executive_snapshot_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: 'Executive snapshot is unavailable.', code: 'ceo_executive_snapshot_unavailable' }, { status: 503, headers: service.responseHeaders });
  }
}
