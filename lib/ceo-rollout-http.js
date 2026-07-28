import { NextResponse } from 'next/server';
import { currentUser } from './auth.js';
import { isDirector } from './perm.js';
import { CeoRolloutError } from './ceo-rollout.js';

const HEADERS = Object.freeze({
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  Vary: 'Cookie, Authorization',
  'X-Content-Type-Options': 'nosniff',
});

export function ceoRolloutJson(body, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

export async function ceoRolloutDirector() {
  const user = await currentUser();
  if (!user) return { response: ceoRolloutJson({ error: 'unauthorized', code: 'unauthorized' }, 401) };
  if (!isDirector(user)) return { response: ceoRolloutJson({ error: 'forbidden', code: 'ceo_rollout_director_required' }, 403) };
  return { user };
}

export function ceoRolloutErrorResponse(error, fallback = 'ceo_rollout_unavailable') {
  if (error instanceof CeoRolloutError || (error?.code && Number.isInteger(error?.status))) {
    return ceoRolloutJson({ error: error.message, code: error.code }, error.status);
  }
  console.error(fallback, { name: error?.name, code: error?.code });
  return ceoRolloutJson({ error: 'CEO rollout service is unavailable.', code: fallback }, 503);
}
