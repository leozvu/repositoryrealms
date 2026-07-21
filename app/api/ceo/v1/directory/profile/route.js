import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { getLocalCeoDirectoryProfile, updateLocalCeoDirectoryProfile } from '@/lib/ceo-messaging-target-admin';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200) => NextResponse.json(body, { status, headers });

export async function GET() {
  const user = await currentUser();
  if (!user) return reply({ error: 'unauthorized', code: 'unauthorized' }, 401);
  try { return reply({ profile: await getLocalCeoDirectoryProfile(prisma, user) }); }
  catch (error) { return reply({ error: error.message, code: error.code }, error.status || 500); }
}

export async function PUT(request) {
  const user = await currentUser();
  if (!user) return reply({ error: 'unauthorized', code: 'unauthorized' }, 401);
  if (!ceoRequestIsSameOrigin(request)) return reply({ error: 'Cross-origin request denied.', code: 'ceo_messaging_csrf_denied' }, 403);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 2_048) return reply({ error: 'payload too large', code: 'ceo_messaging_payload_too_large' }, 413);
    return reply({ profile: await updateLocalCeoDirectoryProfile(prisma, user, JSON.parse(raw)) });
  } catch (error) { return reply({ error: error.message || 'Invalid request.', code: error.code || 'ceo_messaging_profile_update_failed' }, error.status || 400); }
}
