import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/apiauth';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { buildCeoEntityMessageFeed } from '@/lib/ceo-messaging-target-admin';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request) {
  const user = await apiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    const query = new URL(request.url).searchParams;
    return NextResponse.json(await buildCeoEntityMessageFeed(prisma, user, { portalConversationId: query.get('conversationId'), entityId: capabilities.entity.id, after: query.get('after') }), { headers });
  } catch (error) { return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 500, headers }); }
}
