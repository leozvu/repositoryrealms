import { prisma } from '@/lib/prisma';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { getCeoConversation, updateCeoConversationPolicy } from '@/lib/ceo-messaging-admin';
import { ceoMessagingContext, ceoMessagingDirector, ceoMessagingErrorResponse, ceoMessagingJson, ceoMessagingToken } from '@/lib/ceo-messaging-http';

export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  try { return ceoMessagingJson(await getCeoConversation(prisma, auth.user, ceoMessagingToken(request), params.id, ceoMessagingContext(request))); }
  catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_conversation_read_failed'); }
}
export async function PATCH(request, { params }) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoMessagingJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try { return ceoMessagingJson(await updateCeoConversationPolicy(prisma, auth.user, ceoMessagingToken(request), params.id, await request.json().catch(() => ({})), ceoMessagingContext(request))); }
  catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_policy_update_failed'); }
}
