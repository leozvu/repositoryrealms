import { NextResponse } from 'next/server.js';
import { CollaborationError } from './collaboration.js';

export const COLLABORATION_NO_STORE = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Cookie',
};

export function collaborationJson(body, { status = 200, headers = {} } = {}) {
  return NextResponse.json(body, { status, headers: { ...COLLABORATION_NO_STORE, ...headers } });
}

export function collaborationError(error, fallback = 'Không thể xử lý yêu cầu cộng tác.') {
  if (error instanceof CollaborationError) {
    return collaborationJson({ error: error.message, code: error.code }, {
      status: error.status,
      headers: error.status === 429 ? { 'Retry-After': '60' } : {},
    });
  }
  return collaborationJson({ error: fallback, code: 'collaboration_internal_error' }, { status: 500 });
}
