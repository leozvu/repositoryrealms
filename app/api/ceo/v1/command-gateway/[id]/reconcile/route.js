import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import { CEO_COMMAND_GATEWAY_VERSION, CeoCommandError } from '@/lib/ceo-command-gateway';
import { reconcileCeoCommand } from '@/lib/ceo-command-gateway-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Cookie',
  'X-CEO-Command-Version': String(CEO_COMMAND_GATEWAY_VERSION),
  'X-Content-Type-Options': 'nosniff',
};

export async function POST(request, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  if (!isDirector(user)) return NextResponse.json({ error: 'forbidden', code: 'ceo_command_director_required' }, { status: 403, headers });
  if (!ceoRequestIsSameOrigin(request)) return NextResponse.json({ error: 'invalid origin', code: 'invalid_origin' }, { status: 403, headers });
  try {
    const hashSecret = ceoIdentityHashSecret();
    const result = await reconcileCeoCommand(
      prisma,
      user,
      readCeoPortalSessionCookie(request),
      params.id,
      ceoRequestContext(request, hashSecret),
    );
    return NextResponse.json(result, { status: result.terminal ? 200 : 202, headers });
  } catch (error) {
    const known = error instanceof CeoCommandError || error?.name === 'CeoIdentityError';
    if (!known) console.error('ceo_command_reconcile_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({
      error: known ? error.message : 'CEO command reconciliation is unavailable.',
      code: known ? error.code : 'ceo_command_reconcile_failed',
    }, { status: known ? error.status : 503, headers });
  }
}
