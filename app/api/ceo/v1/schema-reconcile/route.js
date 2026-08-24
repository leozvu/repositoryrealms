import { NextResponse } from 'next/server';
import {
  CeoSchemaReconcileError,
  reconcileDeploymentSchema,
} from '@/lib/ceo-schema-reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await reconcileDeploymentSchema({ request, body });
    return NextResponse.json({ ok: true, result }, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    const known = error instanceof CeoSchemaReconcileError;
    if (!known) console.error('[CEO schema reconcile]', { category: error?.name || 'SchemaReconcileError', prismaCode: error?.code || null });
    return NextResponse.json({
      ok: false,
      error: known ? error.message : 'Schema reconciliation failed.',
      code: known ? error.code : 'ceo_schema_reconcile_failed',
    }, { status: known ? error.status : 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
