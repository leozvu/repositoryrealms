import { NextResponse } from 'next/server';
import { CeoIdentityError, ceoPortalSessionCookieName } from './ceo-identity.js';

export const CEO_IDENTITY_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  Vary: 'Cookie, Authorization',
  'X-Content-Type-Options': 'nosniff',
});

export function ceoIdentityJson(body, status = 200) {
  return NextResponse.json(body, { status, headers: CEO_IDENTITY_HEADERS });
}

export function ceoIdentityErrorResponse(error, fallbackCode = 'ceo_identity_unavailable') {
  if (error instanceof CeoIdentityError) {
    return ceoIdentityJson({ error: error.message, code: error.code }, error.status);
  }
  console.error(fallbackCode, { name: error?.name, code: error?.code });
  return ceoIdentityJson({ error: 'CEO identity service is unavailable.', code: fallbackCode }, 503);
}

export function readCeoPortalSessionCookie(request) {
  return request.cookies.get(ceoPortalSessionCookieName(request.nextUrl.protocol === 'https:'))?.value
    || request.cookies.get(ceoPortalSessionCookieName(false))?.value
    || '';
}

export function setCeoPortalSessionCookie(response, request, token, maxAgeSeconds) {
  const secure = request.nextUrl.protocol === 'https:';
  response.cookies.set(ceoPortalSessionCookieName(secure), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: maxAgeSeconds,
  });
  return response;
}

export function clearCeoPortalSessionCookie(response, request) {
  const secure = request.nextUrl.protocol === 'https:';
  response.cookies.set(ceoPortalSessionCookieName(secure), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
  return response;
}

export function ceoRequestContext(request, hashSecret) {
  return {
    hashSecret,
    userAgent: request.headers.get('user-agent') || '',
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '',
  };
}
