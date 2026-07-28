import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isDirector } from '@/lib/perm';
import { ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { ceoRequestContext, readCeoPortalSessionCookie } from '@/lib/ceo-identity-http';
import {
  CEO_COMMAND_GATEWAY_VERSION,
  CEO_COMMAND_MAX_BODY_BYTES,
  CeoCommandError,
} from '@/lib/ceo-command-gateway';
import { dispatchCeoCommand, listCeoCommandDeliveries } from '@/lib/ceo-command-gateway-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Cookie',
  'X-CEO-Command-Version': String(CEO_COMMAND_GATEWAY_VERSION),
  'X-Content-Type-Options': 'nosniff',
};

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers });
}

async function director() {
  const user = await currentUser();
  if (!user) return { response: json({ error: 'unauthorized', code: 'unauthorized' }, 401) };
  if (!isDirector(user)) return { response: json({ error: 'forbidden', code: 'ceo_command_director_required' }, 403) };
  return { user };
}

function errorResponse(error, fallbackCode) {
  const known = error instanceof CeoCommandError || error?.name === 'CeoIdentityError';
  if (!known) console.error(fallbackCode, { name: error?.name, code: error?.code });
  return json({
    error: known ? error.message : 'CEO command gateway is unavailable.',
    code: known ? error.code : fallbackCode,
  }, known ? error.status : 503);
}

function context(request) {
  const hashSecret = ceoIdentityHashSecret();
  return ceoRequestContext(request, hashSecret);
}

export async function GET(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  try {
    return json(await listCeoCommandDeliveries(
      prisma,
      auth.user,
      readCeoPortalSessionCookie(request),
      {
        entityId: request.nextUrl.searchParams.get('entityId') || null,
        limit: request.nextUrl.searchParams.get('limit') || 50,
      },
      context(request),
    ));
  } catch (error) {
    return errorResponse(error, 'ceo_command_list_failed');
  }
}

export async function POST(request) {
  const auth = await director();
  if (auth.response) return auth.response;
  if (!ceoRequestIsSameOrigin(request)) return json({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > CEO_COMMAND_MAX_BODY_BYTES) return json({ error: 'payload too large', code: 'ceo_command_payload_too_large' }, 413);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > CEO_COMMAND_MAX_BODY_BYTES) {
      throw new CeoCommandError('Command payload is too large.', 413, 'ceo_command_payload_too_large');
    }
    let body;
    try { body = JSON.parse(raw); } catch { throw new CeoCommandError('Command JSON is invalid.', 400, 'ceo_command_json_invalid'); }
    const result = await dispatchCeoCommand(
      prisma,
      auth.user,
      readCeoPortalSessionCookie(request),
      body,
      context(request),
    );
    return json(result, result.delivery.status === 'delivered' ? 201 : 202);
  } catch (error) {
    return errorResponse(error, 'ceo_command_dispatch_failed');
  }
}
