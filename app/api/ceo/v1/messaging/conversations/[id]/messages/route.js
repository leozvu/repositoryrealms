import { prisma } from '@/lib/prisma';
import { ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { sendCeoMessage } from '@/lib/ceo-messaging-admin';
import { CEO_MESSAGING_MAX_BODY_BYTES, CeoMessagingError } from '@/lib/ceo-messaging';
import { ceoMessagingContext, ceoMessagingDirector, ceoMessagingErrorResponse, ceoMessagingJson, ceoMessagingToken } from '@/lib/ceo-messaging-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request, { params }) {
  const auth = await ceoMessagingDirector(); if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return ceoMessagingJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const raw = await request.text(); if (Buffer.byteLength(raw, 'utf8') > CEO_MESSAGING_MAX_BODY_BYTES) throw new CeoMessagingError('Message payload is too large.', 413, 'ceo_messaging_payload_too_large');
    let body; try { body = JSON.parse(raw); } catch { throw new CeoMessagingError('Message JSON is invalid.', 400, 'ceo_messaging_json_invalid'); }
    const result = await sendCeoMessage(prisma, auth.user, ceoMessagingToken(request), params.id, body, ceoMessagingContext(request));
    return ceoMessagingJson(result, ['delivered', 'read'].includes(result.message.status) ? 201 : 202);
  } catch (error) { return ceoMessagingErrorResponse(error, 'ceo_messaging_send_failed'); }
}
