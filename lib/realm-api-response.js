import { NextResponse } from 'next/server.js';
import { observeRealmApiRequest, safeRealmException } from './realm-observability.js';

export const REALM_PRIVATE_NO_STORE = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0',
  Vary: 'Cookie',
};

export function realmJsonResponse(trace, body, {
  status = 200,
  code = status >= 400 ? 'realm_request_failed' : 'realm_ok',
  outcome,
  headers = {},
  observation = undefined,
} = {}) {
  const observed = observeRealmApiRequest(trace, { status, code, outcome }, observation);
  const responseBody = status >= 400 && body && !Array.isArray(body)
    ? { ...body, requestId: observed.event.requestId }
    : body;
  return NextResponse.json(responseBody, {
    status,
    headers: { ...REALM_PRIVATE_NO_STORE, ...headers, ...observed.headers },
  });
}

export function realmEmptyResponse(trace, {
  status = 204,
  code = 'realm_not_modified',
  outcome = 'not_modified',
  headers = {},
  observation = undefined,
} = {}) {
  const observed = observeRealmApiRequest(trace, { status, code, outcome }, observation);
  return new NextResponse(null, {
    status,
    headers: { ...REALM_PRIVATE_NO_STORE, ...headers, ...observed.headers },
  });
}

export function realmErrorResponse(trace, error, {
  fallbackMessage = 'Không thể xử lý yêu cầu Realm.',
  fallbackCode = 'realm_internal_error',
  retryAfter = null,
  observation = undefined,
} = {}) {
  const status = Number(error?.status);
  const publicError = Number.isInteger(status)
    && status >= 400
    && status < 600
    && typeof error?.code === 'string'
    && (status < 500 || error?.expose === true);
  const responseStatus = publicError ? status : 500;
  const code = publicError ? error.code : fallbackCode;
  if (!publicError || responseStatus >= 500) safeRealmException(trace, error, code);
  const effectiveRetryAfter = retryAfter ?? error?.retryAfter ?? null;
  return realmJsonResponse(trace, {
    error: publicError ? error.message : fallbackMessage,
    code,
  }, {
    status: responseStatus,
    code,
    outcome: responseStatus >= 500 ? 'degraded' : 'rejected',
    headers: effectiveRetryAfter ? { 'Retry-After': String(effectiveRetryAfter) } : {},
    observation,
  });
}
