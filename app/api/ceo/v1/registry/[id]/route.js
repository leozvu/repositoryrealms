import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { updateCeoRegistryEntity } from '@/lib/ceo-entity-registry-admin';
import { CeoRegistryError } from '@/lib/ceo-entity-registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function PATCH(request, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  if (!isDirector(user)) {
    return NextResponse.json({ error: 'forbidden', code: 'ceo_registry_director_required' }, { status: 403, headers });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const entity = await updateCeoRegistryEntity(prisma, user, params.id, body);
    return NextResponse.json({ ok: true, entity }, { headers });
  } catch (error) {
    if (error instanceof CeoRegistryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
    }
    console.error('ceo_registry_update_failed', error);
    return NextResponse.json(
      { error: 'CEO entity registry update failed', code: 'ceo_registry_update_failed' },
      { status: 503, headers },
    );
  }
}
