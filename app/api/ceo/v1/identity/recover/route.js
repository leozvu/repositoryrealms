import { encode } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';
import { rolesOf } from '@/lib/perm';
import { realmDemoSessionCookieName } from '@/lib/realm-demo-session';
import { CEO_PORTAL_SESSION_TTL_MS, ceoIdentityHashSecret, ceoRequestIsSameOrigin } from '@/lib/ceo-identity';
import { recoverCeoPortalAccount } from '@/lib/ceo-identity-admin';
import { ceoIdentityErrorResponse, ceoIdentityJson, ceoRequestContext, setCeoPortalSessionCookie } from '@/lib/ceo-identity-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  if (!ceoRequestIsSameOrigin(request)) return ceoIdentityJson({ error: 'invalid origin', code: 'invalid_origin' }, 403);
  try {
    const nextAuthSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!nextAuthSecret) return ceoIdentityJson({ error: 'session configuration unavailable', code: 'session_configuration_missing' }, 503);
    const body = await request.json().catch(() => ({}));
    const hashSecret = ceoIdentityHashSecret();
    const recovered = await recoverCeoPortalAccount(prisma, body, ceoRequestContext(request, hashSecret));
    const secure = request.nextUrl.protocol === 'https:';
    const roles = rolesOf(recovered.user);
    const sessionToken = await encode({
      secret: nextAuthSecret,
      maxAge: CEO_PORTAL_SESSION_TTL_MS / 1000,
      token: {
        sub: recovered.user.id,
        uid: recovered.user.id,
        email: recovered.user.email,
        name: recovered.user.name,
        role: recovered.user.role,
        roles,
        teamId: recovered.user.teamId || null,
        userType: recovered.user.userType || 'employee',
        ceoRecovery: true,
      },
    });
    const response = ceoIdentityJson({ ok: true, destination: '/ceo-security', assurance: 'recovery', stepUpRequired: true });
    response.cookies.set(realmDemoSessionCookieName(secure), sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: CEO_PORTAL_SESSION_TTL_MS / 1000,
    });
    return setCeoPortalSessionCookie(response, request, recovered.token, CEO_PORTAL_SESSION_TTL_MS / 1000);
  } catch (error) {
    return ceoIdentityErrorResponse(error, 'ceo_recovery_failed');
  }
}
