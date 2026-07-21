import { prisma } from '@/lib/prisma';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { listCeoDirectory, syncCeoDirectory } from '@/lib/ceo-messaging-admin';
import { ceoMessagingContext, ceoMessagingDirector, ceoMessagingErrorResponse, ceoMessagingJson, ceoMessagingToken } from '@/lib/ceo-messaging-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  try { return ceoMessagingJson(await listCeoDirectory(prisma, auth.user, ceoMessagingToken(request), ceoMessagingContext(request))); }
  catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_directory_list_failed'); }
}
export async function POST(request) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoMessagingJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try { const body = await request.json().catch(() => ({})); return ceoMessagingJson(await syncCeoDirectory(prisma, auth.user, ceoMessagingToken(request), { entityId: body.entityId || null }, ceoMessagingContext(request))); }
  catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_directory_sync_failed'); }
}
