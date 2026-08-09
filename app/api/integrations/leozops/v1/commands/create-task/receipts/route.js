import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadCeoCapabilities } from '@/lib/ceo-entity-admin';
import { CEO_SERVICE_SCOPES } from '@/lib/ceo-service-auth';
import { ceoServiceGuard } from '@/lib/ceo-service-http';
import {
  LEOZOPS_TASK_COMMAND_VERSION,
  LeozOpsTaskCommandError,
} from '@/lib/leozops-task-command';
import { findLeozOpsTaskCommandReceipt } from '@/lib/leozops-task-command-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Authorization',
  'X-LeozOps-Task-Command-Version': String(LEOZOPS_TASK_COMMAND_VERSION),
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request) {
  if (process.env.LEOZOPS_TASK_COMMAND_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const service = await ceoServiceGuard(request, CEO_SERVICE_SCOPES.LEOZOPS_TASK_RECEIPTS_READ, headers);
  if (service.response) return service.response;
  try {
    const capabilities = await loadCeoCapabilities(prisma);
    const result = await findLeozOpsTaskCommandReceipt(prisma, service.user, {
      entityId: capabilities.entity.id,
      correlationId: request.nextUrl.searchParams.get('correlationId'),
    });
    return NextResponse.json(result, { headers: service.responseHeaders });
  } catch (error) {
    const known = error instanceof LeozOpsTaskCommandError;
    if (!known) console.error('leozops_task_receipt_lookup_failed', { name: error?.name, code: error?.code });
    return NextResponse.json({
      error: known ? error.message : 'LeozOps task receipt service is unavailable.',
      code: known ? error.code : 'leozops_task_receipt_unavailable',
    }, { status: known ? error.status : 503, headers: service.responseHeaders });
  }
}

export function POST() {
  if (process.env.LEOZOPS_TASK_COMMAND_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'method not allowed' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
}

export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
