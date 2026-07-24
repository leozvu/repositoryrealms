// v3.40 (Đợt 3b) — PORTAL: phát mã SSO nhân sự (POST) và đổi mã (PUT).
// Công ty gọi tự xác thực bằng shared secret SSO của chính mình (không cần phiên CEO).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CeoStaffError } from '@/lib/ceo-staff-bridge';
import { authenticateEntityCaller, issueStaffSsoCode, redeemStaffSsoCode } from '@/lib/ceo-staff-bridge-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

function fail(error) {
  const known = error instanceof CeoStaffError;
  if (!known) console.error('ceo_staff_sso_failed', { name: error?.name, code: error?.code });
  return NextResponse.json(
    { error: known ? error.message : 'Cầu nối nhân sự không khả dụng.', code: known ? error.code : 'ceo_staff_unavailable' },
    { status: known ? error.status : 503, headers },
  );
}

// Công ty NGUỒN xin mã cho nhân sự của mình
export async function POST(request) {
  try {
    const sourceEntityId = authenticateEntityCaller(request);
    const body = await request.json().catch(() => ({}));
    const result = await issueStaffSsoCode(prisma, {
      sourceEntityId,
      targetEntityId: String(body.targetEntityId || '').trim().toLowerCase(),
      sourceUserEmail: body.sourceUserEmail,
      redirectPath: body.redirectPath,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return fail(error);
  }
}

// Công ty ĐÍCH đổi mã lấy danh tính (một lần duy nhất)
export async function PUT(request) {
  try {
    const targetEntityId = authenticateEntityCaller(request);
    const body = await request.json().catch(() => ({}));
    const result = await redeemStaffSsoCode(prisma, { targetEntityId, code: String(body.code || '') });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return fail(error);
  }
}
