import { encode } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rolesOf } from '@/lib/perm';
import { realmDemoSessionCookieName } from '@/lib/realm-demo-session';
import { resolveCeoEntityIdentity } from '@/lib/ceo-entity-contract';
import {
  CEO_PORTAL_SESSION_TTL_MS,
  CeoIdentityError,
  normalizeCeoPortalOrigin,
  normalizeCeoSsoArtifact,
  verifyCeoEntityAssertion,
} from '@/lib/ceo-identity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function failure(request, code) {
  const url = new URL('/login', request.nextUrl.origin);
  url.searchParams.set('sso', code);
  return NextResponse.redirect(url, { status: 303, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  try {
    normalizeCeoSsoArtifact(code, 'code');
    normalizeCeoSsoArtifact(state, 'state');
    const portalOrigin = normalizeCeoPortalOrigin(process.env.CEO_PORTAL_ORIGIN);
    const entitySecret = String(process.env.CEO_SSO_ENTITY_API_KEY || '');
    const identity = resolveCeoEntityIdentity({
      explicitEntityId: process.env.CEO_ENTITY_ID,
      runtimeUrl: request.nextUrl.origin,
      databaseUrl: process.env.DATABASE_URL,
    });
    if (!identity.id || identity.id === 'unconfigured-entity') throw new CeoIdentityError('Entity identity is unavailable.', 503, 'ceo_sso_entity_unconfigured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let exchange;
    try {
      exchange = await fetch(`${portalOrigin}/api/ceo/v1/sso/exchange`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${entitySecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: identity.id, code, state }),
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!exchange.ok) throw new CeoIdentityError('Portal exchange rejected.', 401, 'ceo_sso_exchange_rejected');
    const body = await exchange.json();
    const assertion = verifyCeoEntityAssertion({ assertion: body.assertion, entityId: identity.id, entitySecret });
    const localUser = await prisma.user.findUnique({ where: { email: String(assertion.localUserEmail || '').toLowerCase() } });
    if (!localUser || localUser.status !== 'active' || !rolesOf(localUser).includes('DIRECTOR')) {
      throw new CeoIdentityError('Local Director mapping is unavailable.', 403, 'ceo_sso_local_director_missing');
    }
    const nextAuthSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!nextAuthSecret) throw new CeoIdentityError('Local session configuration is unavailable.', 503, 'session_configuration_missing');
    const secure = request.nextUrl.protocol === 'https:';
    const sessionToken = await encode({
      secret: nextAuthSecret,
      maxAge: CEO_PORTAL_SESSION_TTL_MS / 1000,
      token: {
        sub: localUser.id,
        uid: localUser.id,
        email: localUser.email,
        name: localUser.name,
        role: localUser.role,
        roles: rolesOf(localUser),
        teamId: localUser.teamId || null,
        userType: localUser.userType || 'employee',
        ceoGlobalSubject: assertion.sub,
        ceoSsoEntity: identity.id,
      },
    });
    await prisma.auditLog.create({ data: { userId: localUser.id, userName: localUser.name, action: 'ceo_sso_local_session_started', entity: 'auth', refId: assertion.sub, detail: `entity=${identity.id}; assurance=portal_mfa` } });
    const response = NextResponse.redirect(new URL(assertion.redirectPath, request.nextUrl.origin), { status: 303, headers: { 'Cache-Control': 'private, no-store' } });
    response.cookies.set(realmDemoSessionCookieName(secure), sessionToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: CEO_PORTAL_SESSION_TTL_MS / 1000 });
    return response;
  } catch (error) {
    console.error('ceo_sso_callback_failed', { name: error?.name, code: error?.code });
    return failure(request, error instanceof CeoIdentityError ? error.code : 'ceo_sso_callback_failed');
  }
}
