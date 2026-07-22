import { prisma } from '@/lib/prisma';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { createCeoConversation, listCeoConversations } from '@/lib/ceo-messaging-admin';
import { CEO_MESSAGING_MAX_BODY_BYTES, CeoMessagingError } from '@/lib/ceo-messaging';
import { ceoMessagingContext, ceoMessagingDirector, ceoMessagingErrorResponse, ceoMessagingJson, ceoMessagingToken } from '@/lib/ceo-messaging-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  try { return ceoMessagingJson(await listCeoConversations(prisma, auth.user, ceoMessagingToken(request), ceoMessagingContext(request))); }
  catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_conversation_list_failed'); }
}
export async function POST(request) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoMessagingJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const raw = await request.text(); if (Buffer.byteLength(raw, 'utf8') > CEO_MESSAGING_MAX_BODY_BYTES) throw new CeoMessagingError('Payload is too large.', 413, 'ceo_messaging_payload_too_large');
    let body; try { body = JSON.parse(raw); } catch { throw new CeoMessagingError('Conversation JSON is invalid.', 400, 'ceo_messaging_json_invalid'); }
    return ceoMessagingJson(await createCeoConversation(prisma, auth.user, ceoMessagingToken(request), body, ceoMessagingContext(request)), 201);
  } catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_conversation_create_failed'); }
}
