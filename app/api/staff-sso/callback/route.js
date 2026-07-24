// v3.40 (Đợt 3b) — CÔNG TY ĐÍCH: nhận mã, đổi lấy danh tính ở portal, tạo phiên local
// theo ĐÚNG quyền của tài khoản tại công ty này (portal không cấp quyền nào).
import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';
import { rolesOf } from '@/lib/perm';
import { normalizeCeoPortalOrigin } from '@/lib/ceo-identity';
import { resolveCeoEntityIdentity } from '@/lib/ceo-entity-contract';
import { realmDemoSessionCookieName } from '@/lib/realm-demo-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const SESSION_TTL_MS = 8 * 60 * 60_000;

const deny = (request, code) =>
  NextResponse.redirect(new URL(`/login?staff_sso=${encodeURIComponent(code)}`, request.nextUrl.origin), { status: 303 });

export async function GET(request) {
  const code = request.nextUrl.searchParams.get('code') || '';
  try {
    const portalOrigin = normalizeCeoPortalOrigin(process.env.CEO_PORTAL_ORIGIN);
    const identity = resolveCeoEntityIdentity({
      explicitEntityId: process.env.CEO_ENTITY_ID,
      runtimeUrl: request.nextUrl.origin,
      databaseUrl: process.env.DATABASE_URL,
    });
    if (!identity.id || identity.id === 'unconfigured-entity') return deny(request, 'entity_unconfigured');

    const exchange = await fetch(`${portalOrigin}/api/ceo/v1/staff/sso`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CEO_SSO_ENTITY_API_KEY || ''}`,
        'x-ceo-entity-id': identity.id,
      },
      body: JSON.stringify({ code }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!exchange.ok) return deny(request, 'code_invalid');
    const claim = await exchange.json();

    const localUser = await prisma.user.findUnique({ where: { email: String(claim.localUserEmail || '').toLowerCase() } });
    if (!localUser || localUser.status !== 'active') return deny(request, 'local_account_missing');
    // Freelancer đi cổng riêng, không dùng cầu nối nhân sự nội bộ
    if (localUser.userType === 'freelancer') return deny(request, 'freelancer_not_supported');
    if (localUser.accessUntil && localUser.accessUntil < new Date().toISOString().slice(0, 10)) return deny(request, 'account_expired');

    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!secret) return deny(request, 'session_config_missing');
    const secure = request.nextUrl.protocol === 'https:';
    const sessionToken = await encode({
      secret,
      maxAge: SESSION_TTL_MS / 1000,
      token: {
        sub: localUser.id, uid: localUser.id, email: localUser.email, name: localUser.name,
        role: localUser.role, roles: rolesOf(localUser), teamId: localUser.teamId || null,
        userType: localUser.userType || 'employee',
        staffSsoFrom: claim.sourceEntity,
      },
    });
    await prisma.auditLog.create({ data: {
      userId: localUser.id, userName: localUser.name, action: 'staff_sso_session_started',
      entity: 'auth', refId: claim.sourceEntity, detail: `Đăng nhập bằng cầu nối group từ ${claim.sourceEntity}`,
    } }).catch(() => {});

    const response = NextResponse.redirect(new URL(claim.redirectPath || '/dashboard', request.nextUrl.origin), {
      status: 303, headers: { 'Cache-Control': 'private, no-store' },
    });
    response.cookies.set(realmDemoSessionCookieName(secure), sessionToken, {
      httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_TTL_MS / 1000,
    });
    return response;
  } catch (error) {
    console.error('staff_sso_callback_failed', { name: error?.name });
    return deny(request, 'bridge_unavailable');
  }
}
