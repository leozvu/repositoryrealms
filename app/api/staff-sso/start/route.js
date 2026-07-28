// v3.40 (Đợt 3b) — CÔNG TY NGUỒN: nhân sự đang đăng nhập bấm "Mở công ty khác".
// Công ty tự xác thực với portal bằng shared secret của mình, xin mã ngắn hạn rồi
// chuyển hướng người dùng sang công ty đích. Không có mật khẩu nào đi qua đây.
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { normalizeCeoPortalOrigin } from '@/lib/ceo-identity';
import { resolveCeoEntityIdentity } from '@/lib/ceo-entity-contract';
import { normalizeRedirectPath } from '@/lib/ceo-staff-bridge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const targetEntityId = String(body.targetEntityId || '').trim().toLowerCase();
    const portalOrigin = normalizeCeoPortalOrigin(process.env.CEO_PORTAL_ORIGIN);
    const identity = resolveCeoEntityIdentity({
      explicitEntityId: process.env.CEO_ENTITY_ID,
      runtimeUrl: request.nextUrl.origin,
      databaseUrl: process.env.DATABASE_URL,
    });
    if (!identity.id || identity.id === 'unconfigured-entity') {
      return NextResponse.json({ error: 'Công ty chưa cấu hình cầu nối group.', code: 'staff_sso_entity_unconfigured' }, { status: 503 });
    }
    const response = await fetch(`${portalOrigin}/api/ceo/v1/staff/sso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CEO_SSO_ENTITY_API_KEY || ''}`,
        'x-ceo-entity-id': identity.id,
      },
      body: JSON.stringify({
        targetEntityId,
        sourceUserEmail: user.email,
        redirectPath: normalizeRedirectPath(body.redirectPath),
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: payload.error || 'Không xin được mã chuyển công ty.', code: payload.code || 'staff_sso_denied' }, { status: response.status });
    }
    const url = new URL(payload.target.callbackUrl);
    url.searchParams.set('code', payload.code);
    return NextResponse.json({ destination: url.toString(), target: payload.target.displayName });
  } catch (error) {
    console.error('staff_sso_start_failed', { name: error?.name });
    return NextResponse.json({ error: 'Không kết nối được cầu nối group.', code: 'staff_sso_bridge_unavailable' }, { status: 503 });
  }
}
