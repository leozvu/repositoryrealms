import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { executeRepositoryRealmsAction } from '@/lib/repository-realms';
import { CEO_MESSAGING_MAX_BODY_BYTES, CEO_MESSAGING_VERSION, CeoMessagingError, normalizeCeoMessageEnvelope } from '@/lib/ceo-messaging';
import { assertCeoMessageHeaders, ceoMessageRepositoryExecutor } from '@/lib/ceo-messaging-target-admin';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Authorization', 'X-CEO-Messaging-Version': String(CEO_MESSAGING_VERSION), 'X-Content-Type-Options': 'nosniff' };

export async function POST(request) {
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.MESSAGE_DELIVER, headers);
  if (service.response) return service.response;
  const user = service.user;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > CEO_MESSAGING_MAX_BODY_BYTES) throw new CeoMessagingError('Message payload is too large.', 413, 'ceo_messaging_payload_too_large');
    let body;
    try { body = JSON.parse(raw); } catch { throw new CeoMessagingError('Message JSON is invalid.', 400, 'ceo_messaging_json_invalid'); }
    const message = normalizeCeoMessageEnvelope(body);
    assertCeoMessageHeaders(request, message);
    const capabilities = await loadCeoCapabilities(prisma);
    const result = await executeRepositoryRealmsAction(prisma, user, body, { executor: ceoMessageRepositoryExecutor({ entityId: capabilities.entity.id, messagingEnabled: capabilities.capabilities.messaging.enabled }) });
    return NextResponse.json({ contract: result.contract, version: result.version, receipt: result.receipt, repository: result.repository }, { status: result.idempotent ? 200 : 201, headers: service.responseHeaders });
  } catch (error) {
    const known = error instanceof CeoMessagingError || error?.name === 'RealmOperationError';
    if (!known) console.error('ceo_target_message_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: known ? error.message : 'Message delivery is unavailable.', code: known ? error.code : 'ceo_messaging_target_unavailable' }, { status: known ? error.status : 503, headers: service.responseHeaders });
  }
}
