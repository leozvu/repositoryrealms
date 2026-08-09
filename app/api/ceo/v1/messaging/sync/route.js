import { prisma } from '@/lib/prisma';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { syncCeoInbox } from '@/lib/ceo-messaging-admin';
import { ceoMessagingContext, ceoMessagingDirector, ceoMessagingErrorResponse, ceoMessagingJson, ceoMessagingToken } from '@/lib/ceo-messaging-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await ceoMessagingDirector();
  if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoMessagingJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    return ceoMessagingJson(await syncCeoInbox(
      prisma,
      auth.user,
      ceoMessagingToken(request),
      { limit: body.limit },
      ceoMessagingContext(request),
    ));
  } catch (error) {
    return ceoMessagingErrorResponse(error, 'ceo_messaging_sync_failed');
  }
}
