import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadLocalCeoDecisionFeed } from '@/lib/ceo-decision-target-admin';
import { CEO_DECISION_QUEUE_VERSION } from '@/lib/ceo-decision-queue';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
  'X-CEO-Decision-Version': String(CEO_DECISION_QUEUE_VERSION),
};

export async function GET(request) {
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.DECISIONS_READ, headers);
  if (service.response) return service.response;
  try {
    return NextResponse.json(await loadLocalCeoDecisionFeed(prisma), { headers: service.responseHeaders });
  } catch (error) {
    console.error('ceo_decision_feed_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: 'Decision feed is unavailable.', code: 'ceo_decision_feed_unavailable' }, { status: 503, headers: service.responseHeaders });
  }
}
