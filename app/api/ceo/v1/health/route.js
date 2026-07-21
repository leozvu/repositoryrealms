import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/apiauth';
import { loadCeoHealth } from '@/lib/ceo-entity-admin';
import { CEO_CONTRACT_VERSION } from '@/lib/ceo-entity-contract';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization',
  'X-CEO-Contract-Version': CEO_CONTRACT_VERSION,
};

export async function GET(req) {
  const user = await apiUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  if (!(user.roles || []).includes('DIRECTOR')) {
    return NextResponse.json({ error: 'forbidden', code: 'ceo_director_scope_required' }, { status: 403, headers });
  }

  try {
    const payload = await loadCeoHealth();
    return NextResponse.json(payload, { status: payload.status === 'ready' ? 200 : 503, headers });
  } catch (error) {
    console.error('ceo_health_failed', error);
    return NextResponse.json({ error: 'CEO entity health unavailable', code: 'ceo_health_unavailable' }, { status: 503, headers });
  }
}
