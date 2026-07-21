import { NextResponse } from 'next/server';
import { currentUser } from './auth.js';
import { isDirector } from './perm.js';
import { ceoIdentityHashSecret } from './ceo-identity.js';
import { ceoRequestContext, readCeoPortalSessionCookie } from './ceo-identity-http.js';
import { CEO_MESSAGING_VERSION, CeoMessagingError } from './ceo-messaging.js';

export const CEO_MESSAGING_RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-cache, no-store, max-age=0', Vary: 'Cookie',
  'X-CEO-Messaging-Version': String(CEO_MESSAGING_VERSION), 'X-Content-Type-Options': 'nosniff',
});

export function ceoMessagingJson(body, status = 200, extraHeaders = {}) {
  return NextResponse.json(body, { status, headers: { ...CEO_MESSAGING_RESPONSE_HEADERS, ...extraHeaders } });
}

export async function ceoMessagingDirector() {
  const user = await currentUser();
  if (!user) return { response: ceoMessagingJson({ error: 'unauthorized', code: 'unauthorized' }, 401) };
  if (!isDirector(user)) return { response: ceoMessagingJson({ error: 'forbidden', code: 'ceo_messaging_director_required' }, 403) };
  return { user };
}

export function ceoMessagingContext(request) {
  return { ...ceoRequestContext(request, ceoIdentityHashSecret()), messageSecret: process.env.CEO_MESSAGING_ENCRYPTION_SECRET };
}

export function ceoMessagingToken(request) { return readCeoPortalSessionCookie(request); }

export function ceoMessagingErrorResponse(error, fallback = 'ceo_messaging_unavailable') {
  const known = error instanceof CeoMessagingError || error?.name === 'CeoIdentityError';
  if (!known) console.error(fallback, { name: error?.name, code: error?.code });
  return ceoMessagingJson({ error: known ? error.message : 'CEO messaging is unavailable.', code: known ? error.code : fallback }, known ? error.status : 503);
}
