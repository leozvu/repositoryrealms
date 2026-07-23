import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { loadCeoUnifiedDashboard } from '@/lib/ceo-unified-dashboard-admin';
import { CEO_DASHBOARD_VERSION, CeoDashboardError } from '@/lib/ceo-unified-dashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Cookie',
  'X-CEO-Dashboard-Version': String(CEO_DASHBOARD_VERSION),
};

export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  if (!isDirector(user)) {
    return NextResponse.json({ error: 'forbidden', code: 'ceo_dashboard_director_required' }, { status: 403, headers });
  }
  try {
    const entityId = request.nextUrl.searchParams.get('entity') || 'all';
    const model = await loadCeoUnifiedDashboard(prisma, user, { entityId });
    // Đợt 1: kèm ring rollout từng entity — Tổng quan hiển thị banner chẩn đoán
    // "công ty nào đang ở mức quyền nào" thay vì các trang trống một cách khó hiểu.
    const rings = Object.fromEntries((await prisma.ceoRolloutState.findMany({
      select: { entityId: true, currentRing: true, status: true },
    })).map((row) => [row.entityId, { ring: row.currentRing, status: row.status }]));
    return NextResponse.json({ ...model, rings }, { headers });
  } catch (error) {
    const status = error instanceof CeoDashboardError ? error.status : 503;
    const code = error instanceof CeoDashboardError ? error.code : 'ceo_dashboard_unavailable';
    console.error('ceo_dashboard_read_failed', code);
    return NextResponse.json({ error: 'CEO dashboard unavailable', code }, { status, headers });
  }
}
