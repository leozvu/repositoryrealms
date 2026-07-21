import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/apiauth';
import { loadCeoSnapshot } from '@/lib/ceo-entity-admin';
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
    const domains = new URL(req.url).searchParams.get('domains');
    return NextResponse.json(await loadCeoSnapshot(undefined, { requestedDomains: domains }), { headers });
  } catch (error) {
    console.error('ceo_snapshot_failed', error);
    return NextResponse.json({ error: 'CEO snapshot unavailable', code: 'ceo_snapshot_unavailable' }, { status: 503, headers });
  }
}
