import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { emitEvent } from '@/lib/events';
import { prisma } from '@/lib/prisma';
import { executeRepositoryRealmsAction } from '@/lib/repository-realms';
import { RealmOperationError } from '@/lib/realm-operation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 16_384) throw new RealmOperationError('Payload vượt giới hạn cho phép.', 413, 'execution_payload_too_large');
    const user = await currentUser();
    let body;
    try { body = await request.json(); } catch {
      throw new RealmOperationError('Payload JSON không hợp lệ.', 400, 'invalid_json');
    }
    const result = await executeRepositoryRealmsAction(prisma, user, {
      ...body,
      idempotencyKey: request.headers.get('Idempotency-Key') || body?.idempotencyKey,
    });
    if (!result.idempotent) {
      const emissions = result.emissions || [{ resource: result.resource, event: result.event || 'update', before: result.before, updated: result.updated }];
      for (const emission of emissions) {
        await emitEvent(emission.resource, emission.event, emission.updated, emission.before, user);
      }
    }
    return NextResponse.json({
      source: 'erp-task',
      idempotent: result.idempotent,
      action: result.action,
      repository: result.repository,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Không thể điều phối công việc.', code: error?.code || 'execution_action_error' }, { status: error?.status || 500 });
  }
}
