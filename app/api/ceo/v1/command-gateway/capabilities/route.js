import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { ceoIdentityHashSecret } from '@/lib/ceo-identity';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import { CeoCommandError } from '@/lib/ceo-command-gateway';
import { loadCeoCommandCapabilities } from '@/lib/ceo-command-gateway-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => NextResponse.json(body, { status, headers });

export async function GET(request) {
  const user = await currentUser();
  if (!user) return json({ error: 'unauthorized', code: 'unauthorized' }, 401);
  if (!isDirector(user)) return json({ error: 'forbidden', code: 'ceo_command_director_required' }, 403);
  try {
    const entityId = request.nextUrl.searchParams.get('entityId');
    return json(await loadCeoCommandCapabilities(
      prisma,
      user,
      readCeoPortalSessionCookie(request),
      entityId,
      ceoRequestContext(request, ceoIdentityHashSecret()),
    ));
  } catch (error) {
    const known = error instanceof CeoCommandError || error?.name === 'CeoIdentityError';
    if (!known) console.error('ceo_command_capabilities_failed', { name: error?.name, code: error?.code });
    return json({
      error: known ? error.message : 'CEO command capabilities are unavailable.',
      code: known ? error.code : 'ceo_command_capabilities_failed',
    }, known ? error.status : 503);
  }
}
