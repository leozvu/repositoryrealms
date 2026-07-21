import { prisma } from '@/lib/prisma';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { refreshCeoConversation } from '@/lib/ceo-messaging-admin';
import { ceoMessagingContext, ceoMessagingDirector, ceoMessagingErrorResponse, ceoMessagingJson, ceoMessagingToken } from '@/lib/ceo-messaging-http';

export const dynamic = 'force-dynamic';
export async function POST(request, { params }) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoMessagingJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try { return ceoMessagingJson(await refreshCeoConversation(prisma, auth.user, ceoMessagingToken(request), params.id, ceoMessagingContext(request))); }
  catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_refresh_failed'); }
}
