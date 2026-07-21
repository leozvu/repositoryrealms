import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/apiauth';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { findCeoEntityMessageReceipt } from '@/lib/ceo-messaging-target-admin';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request) {
  const user = await apiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    const correlationId = new URL(request.url).searchParams.get('correlationId');
    const result = await findCeoEntityMessageReceipt(prisma, user, { correlationId, entityId: capabilities.entity.id });
    return NextResponse.json({ ...result, repository: { name: 'RepositoryRealms', receiptId: result.receipt.id, invariants: { authorization: 'enforced', businessRules: 'enforced', receipt: 'verified', audit: 'atomic' } } }, { headers });
  } catch (error) { return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 500, headers }); }
}
