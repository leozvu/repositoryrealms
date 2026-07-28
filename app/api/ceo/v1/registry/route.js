import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { listCeoRegistryEntities } from '@/lib/ceo-entity-registry-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  if (!isDirector(user)) {
    return NextResponse.json({ error: 'forbidden', code: 'ceo_registry_director_required' }, { status: 403, headers });
  }
  try {
    return NextResponse.json(await listCeoRegistryEntities(prisma, user), { headers });
  } catch (error) {
    console.error('ceo_registry_list_failed', error);
    return NextResponse.json(
      { error: 'CEO entity registry unavailable', code: 'ceo_registry_unavailable' },
      { status: 503, headers },
    );
  }
}
