import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { ceoIdentityHashSecret } from '@/lib/ceo-identity';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import { CeoExecutiveContractError } from '@/lib/ceo-executive-contract';
import { loadCeoExecutiveWorkspace } from '@/lib/ceo-executive-workspace-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => NextResponse.json(body, { status, headers });

export async function GET(request) {
  const user = await currentUser();
  if (!user) return json({ error: 'unauthorized', code: 'unauthorized' }, 401);
  if (!isDirector(user)) return json({ error: 'forbidden', code: 'ceo_executive_director_required' }, 403);
  try {
    return json(await loadCeoExecutiveWorkspace(
      prisma,
      user,
      readCeoPortalSessionCookie(request),
      { entityId: request.nextUrl.searchParams.get('entityId') || 'all' },
      ceoRequestContext(request, ceoIdentityHashSecret()),
    ));
  } catch (error) {
    const known = error instanceof CeoExecutiveContractError || error?.name === 'CeoIdentityError';
    if (!known) console.error('ceo_executive_workspace_failed', { name: error?.name, code: error?.code });
    return json({
      error: known ? error.message : 'Executive workspace is unavailable.',
      code: known ? error.code : 'ceo_executive_workspace_failed',
    }, known ? error.status : 503);
  }
}
