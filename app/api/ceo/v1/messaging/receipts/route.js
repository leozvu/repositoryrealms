import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { findCeoEntityMessageReceipt } from '@/lib/ceo-messaging-target-admin';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request) {
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.MESSAGE_RECEIPTS_READ, headers);
  if (service.response) return service.response;
  const user = service.user;
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    const correlationId = new URL(request.url).searchParams.get('correlationId');
    const result = await findCeoEntityMessageReceipt(prisma, user, { correlationId, entityId: capabilities.entity.id });
    return NextResponse.json({ ...result, repository: { name: 'RepositoryRealms', receiptId: result.receipt.id, invariants: { authorization: 'enforced', businessRules: 'enforced', receipt: 'verified', audit: 'atomic' } } }, { headers: service.responseHeaders });
  } catch (error) { return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 500, headers: service.responseHeaders }); }
}
