import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { refreshCeoUnifiedDashboard } from '@/lib/ceo-unified-dashboard-admin';
import { CEO_DASHBOARD_VERSION, CeoDashboardError } from '@/lib/ceo-unified-dashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Cookie',
  'X-CEO-Dashboard-Version': String(CEO_DASHBOARD_VERSION),
};

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  if (!isDirector(user)) {
    return NextResponse.json({ error: 'forbidden', code: 'ceo_dashboard_director_required' }, { status: 403, headers });
  }
  if (!ceoRequestIsSameOrigin(request)) {
    return NextResponse.json({ error: 'invalid origin', code: 'invalid_origin' }, { status: 403, headers });
  }
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await refreshCeoUnifiedDashboard(prisma, user, {
      entityId: body.entityId || 'all',
      force: body.force === true,
    }), { headers });
  } catch (error) {
    const status = error instanceof CeoDashboardError ? error.status : 503;
    const code = error instanceof CeoDashboardError ? error.code : 'ceo_dashboard_refresh_failed';
    console.error('ceo_dashboard_refresh_failed', code);
    return NextResponse.json({ error: 'CEO dashboard refresh failed', code }, { status, headers });
  }
}
