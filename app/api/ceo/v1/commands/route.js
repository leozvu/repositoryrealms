import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/apiauth';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { executeRepositoryRealmsAction } from '@/lib/repository-realms';
import {
  CEO_COMMAND_GATEWAY_VERSION,
  CEO_COMMAND_MAX_BODY_BYTES,
  CeoCommandError,
  normalizeCeoCommandEnvelope,
} from '@/lib/ceo-command-gateway';
import {
  assertCeoCommandRequestHeaders,
  ceoCommandRepositoryExecutor,
} from '@/lib/ceo-command-target-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Authorization',
  'X-CEO-Command-Version': String(CEO_COMMAND_GATEWAY_VERSION),
  'X-Content-Type-Options': 'nosniff',
};

function errorResponse(error) {
  const known = error instanceof CeoCommandError || error?.name === 'RealmOperationError';
  if (!known) console.error('ceo_target_command_failed', { name: error?.name, code: error?.code });
  return NextResponse.json({
    error: known ? error.message : 'Target command service is unavailable.',
    code: known ? error.code : 'ceo_target_command_unavailable',
  }, { status: known ? error.status : 503, headers });
}

export async function POST(request) {
  const user = await apiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401, headers });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > CEO_COMMAND_MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large', code: 'ceo_command_payload_too_large' }, { status: 413, headers });
  }
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > CEO_COMMAND_MAX_BODY_BYTES) {
      throw new CeoCommandError('Command payload is too large.', 413, 'ceo_command_payload_too_large');
    }
    let body;
    try { body = JSON.parse(raw); } catch { throw new CeoCommandError('Command JSON is invalid.', 400, 'ceo_command_json_invalid'); }
    const command = normalizeCeoCommandEnvelope(body);
    assertCeoCommandRequestHeaders(request, command);
    const capabilities = await loadCeoCapabilities(prisma);
    const result = await executeRepositoryRealmsAction(prisma, user, body, {
      executor: ceoCommandRepositoryExecutor({
        entityId: capabilities.entity.id,
        enabledCapabilities: capabilities.capabilities.enabledDomains,
      }),
    });
    return NextResponse.json({
      contract: result.contract,
      version: result.version,
      receipt: result.receipt,
      repository: result.repository,
    }, { status: result.idempotent ? 200 : 201, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
