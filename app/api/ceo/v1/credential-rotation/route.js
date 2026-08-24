import { NextResponse } from 'next/server';
import {
  CeoCredentialRotationError,
  rotateDeploymentCeoCredential,
} from '@/lib/ceo-credential-rotation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await rotateDeploymentCeoCredential({ request, body });
    return NextResponse.json({ ok: true, result }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const known = error instanceof CeoCredentialRotationError;
    if (!known) console.error('[CEO credential rotation]', { category: error?.name || 'CredentialRotationError', prismaCode: error?.code || null });
    return NextResponse.json({ ok: false, error: known ? error.message : 'Credential rotation failed.', code: known ? error.code : 'ceo_credential_rotation_failed' }, {
      status: known ? error.status : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
