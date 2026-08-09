import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';
import {
  LEOZOPS_TASK_COMMAND_MAX_BODY_BYTES,
  LEOZOPS_TASK_COMMAND_VERSION,
  LeozOpsTaskCommandError,
  assertLeozOpsTaskCommandRequestHeaders,
  normalizeLeozOpsTaskCommand,
} from '@/lib/leozops-task-command';
import { executeLeozOpsTaskCommand } from '@/lib/leozops-task-command-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Authorization',
  'X-LeozOps-Task-Command-Version': String(LEOZOPS_TASK_COMMAND_VERSION),
  'X-Content-Type-Options': 'nosniff',
};

const SCOPE_BY_OPERATION = Object.freeze({
  preview: CEO_SERVICE_SCOPES.LEOZOPS_TASK_PREVIEW,
  approve_execute: CEO_SERVICE_SCOPES.LEOZOPS_TASK_APPROVE,
  execute: CEO_SERVICE_SCOPES.LEOZOPS_TASK_EXECUTE,
  preview_rollback: CEO_SERVICE_SCOPES.LEOZOPS_TASK_ROLLBACK_PREVIEW,
  approve_rollback: CEO_SERVICE_SCOPES.LEOZOPS_TASK_ROLLBACK_APPROVE,
  rollback: CEO_SERVICE_SCOPES.LEOZOPS_TASK_ROLLBACK_EXECUTE,
});

function failure(error, responseHeaders = headers) {
  const known = error instanceof LeozOpsTaskCommandError;
  if (!known) console.error('leozops_task_command_failed', { name: error?.name, code: error?.code });
  return NextResponse.json({
    error: known ? error.message : 'LeozOps task command service is unavailable.',
    code: known ? error.code : 'leozops_task_command_unavailable',
  }, { status: known ? error.status : 503, headers: responseHeaders });
}

async function boundedJson(request) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) {
    throw new LeozOpsTaskCommandError('Content-Type must be application/json.', 415, 'leozops_task_content_type_unsupported');
  }
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > LEOZOPS_TASK_COMMAND_MAX_BODY_BYTES)) {
    throw new LeozOpsTaskCommandError('Task command body is too large.', 413, 'leozops_task_body_too_large');
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > LEOZOPS_TASK_COMMAND_MAX_BODY_BYTES) {
    throw new LeozOpsTaskCommandError('Task command body is too large.', 413, 'leozops_task_body_too_large');
  }
  try { return JSON.parse(raw); }
  catch { throw new LeozOpsTaskCommandError('Task command JSON is invalid.', 400, 'leozops_task_json_invalid'); }
}

export async function POST(request) {
  if (process.env.LEOZOPS_TASK_COMMAND_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const presentedOperation = request.headers.get('x-leozops-operation') || '';
  const scope = SCOPE_BY_OPERATION[presentedOperation];
  if (!scope) return failure(new LeozOpsTaskCommandError('Task command operation is unsupported.', 400, 'leozops_task_operation_unsupported'));
  const service = await ceoServiceGuard(request, scope, headers);
  if (service.response) return service.response;
  try {
    const body = await boundedJson(request);
    const command = normalizeLeozOpsTaskCommand(body);
    assertLeozOpsTaskCommandRequestHeaders(request, command);
    const capabilities = await loadCeoCapabilities(prisma);
    const result = await executeLeozOpsTaskCommand(prisma, service.user, body, new Date(), {
      entityId: capabilities.entity.id,
      enabledCapabilities: capabilities.capabilities.enabledDomains,
      credentialId: service.credential.id,
    });
    const created = ['approve_execute', 'approve_rollback', 'execute', 'rollback'].includes(command.operation);
    const replayed = Boolean(result.approval?.replayed || result.receipt?.replayed);
    return NextResponse.json(result, {
      status: created && !replayed ? 201 : 200,
      headers: service.responseHeaders,
    });
  } catch (error) {
    return failure(error, service.responseHeaders);
  }
}

export function GET() {
  if (process.env.LEOZOPS_TASK_COMMAND_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'method not allowed' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
}

export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
