import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { CEO_COMMAND_GATEWAY_VERSION, CeoCommandError } from '@/lib/ceo-command-gateway';
import { findCeoEntityCommandReceipt } from '@/lib/ceo-command-target-admin';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Authorization',
  'X-CEO-Command-Version': String(CEO_COMMAND_GATEWAY_VERSION),
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request) {
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.COMMAND_RECEIPTS_READ, headers);
  if (service.response) return service.response;
  const user = service.user;
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
    }, { headers: service.responseHeaders });
  } catch (error) {
    const known = error instanceof CeoCommandError;
    if (!known) console.error('ceo_target_receipt_lookup_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({
      error: known ? error.message : 'Target receipt service is unavailable.',
      code: known ? error.code : 'ceo_target_receipt_unavailable',
    }, { status: known ? error.status : 503, headers: service.responseHeaders });
  }
}
