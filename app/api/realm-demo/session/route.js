import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';
import { rolesOf } from '@/lib/perm';
import {
  REALM_DEMO_SESSION_MAX_AGE_SECONDS,
  realmDemoSessionCandidate,
  realmDemoSessionCookieName,
  realmDemoSessionPolicy,
  realmDemoSessionRequestAllowed,
  realmDemoSessionToken,
} from '@/lib/realm-demo-session';

export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
      Vary: 'Cookie',
    },
  });
}

export async function POST(request) {
  const policy = realmDemoSessionPolicy();
  if (!policy.enabled) return json({ ok: false, code: 'realm_demo_session_disabled' }, 404);
  if (!realmDemoSessionRequestAllowed(request)) return json({ ok: false, code: 'invalid_origin' }, 403);

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return json({ ok: false, code: 'session_configuration_missing' }, 503);

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: policy.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roles: true,
        teamId: true,
        status: true,
        userType: true,
        totpSecret: true,
        accessUntil: true,
      },
    });
  } catch (error) {
    console.error('realm_demo_session_user_lookup_failed', { name: error?.name, code: error?.code });
    return json({ ok: false, code: 'session_store_unavailable' }, 503);
  }

  const roles = rolesOf(user || {});
  if (!realmDemoSessionCandidate(user, roles)) {
    return json({ ok: false, code: 'demo_staff_unavailable' }, 503);
  }

  const secure = request.nextUrl.protocol === 'https:';
  const sessionToken = await encode({
    secret,
    maxAge: REALM_DEMO_SESSION_MAX_AGE_SECONDS,
    token: realmDemoSessionToken(user, roles),
  });
  const response = json({ ok: true, destination: '/dashboard', session: 'preview_demo_staff' });
  response.cookies.set(realmDemoSessionCookieName(secure), sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: REALM_DEMO_SESSION_MAX_AGE_SECONDS,
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      action: 'realm_demo_session_started',
      entity: 'auth',
      refId: user.id,
      detail: 'Preview Realm demo handed off to the shared ERP session.',
    },
  }).catch(() => {});

  return response;
}
