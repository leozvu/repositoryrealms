import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/apiauth';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { CEO_COMMAND_GATEWAY_VERSION, CeoCommandError } from '@/lib/ceo-command-gateway';
import { findCeoEntityCommandReceipt } from '@/lib/ceo-command-target-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Authorization',
  'X-CEO-Command-Version': String(CEO_COMMAND_GATEWAY_VERSION),
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request) {
  const user = await apiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    const result = await findCeoEntityCommandReceipt(prisma, user, {
      entityId: capabilities.entity.id,
      correlationId: request.nextUrl.searchParams.get('correlationId'),
    });
    return NextResponse.json({
      ...result,
      repository: {
        name: 'RepositoryRealms',
        receiptId: result.receipt.id,
        invariants: { authorization: 'enforced', businessRules: 'enforced', receipt: 'verified', audit: 'atomic' },
      },
    }, { headers });
  } catch (error) {
    const known = error instanceof CeoCommandError;
    if (!known) console.error('ceo_target_receipt_lookup_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({
      error: known ? error.message : 'Target receipt service is unavailable.',
      code: known ? error.code : 'ceo_target_receipt_unavailable',
    }, { status: known ? error.status : 503, headers });
  }
}
