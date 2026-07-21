import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/apiauth';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { buildLocalCeoDirectory } from '@/lib/ceo-messaging-target-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request) {
  const user = await apiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    return NextResponse.json(await buildLocalCeoDirectory(prisma, user, capabilities.entity), { headers });
  } catch (error) {
    const known = error?.name === 'CeoMessagingError';
    return NextResponse.json({ error: known ? error.message : 'Directory service is unavailable.', code: known ? error.code : 'ceo_messaging_directory_unavailable' }, { status: known ? error.status : 503, headers });
  }
}
