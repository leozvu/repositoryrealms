import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$/;
const SAFE_TOKEN = /[^a-zA-Z0-9._:-]+/g;

function safeToken(value, fallback) {
  const token = String(value || '').trim().replace(SAFE_TOKEN, '_').slice(0, 96);
  return token || fallback;
}

export function normalizeRealmRequestId(value) {
  const requestId = String(value || '').trim();
  return REQUEST_ID.test(requestId) ? requestId : null;
}

export function startRealmApiRequest(request, { route, operation }, { now = () => performance.now(), idFactory = randomUUID } = {}) {
  const upstreamId = normalizeRealmRequestId(request?.headers?.get?.('X-Request-Id'));
  return {
    schemaVersion: 1,
    requestId: upstreamId || `realm_${idFactory()}`,
    route: safeToken(route, 'realm.unknown'),
    operation: safeToken(operation, 'request'),
    method: safeToken(request?.method, 'GET').toUpperCase(),
    startedAt: now(),
  };
}

export function observeRealmApiRequest(trace, {
  status = 200,
  code = 'realm_ok',
  outcome = status >= 500 ? 'error' : status >= 400 ? 'rejected' : 'success',
} = {}, {
  now = () => performance.now(),
  timestamp = () => new Date().toISOString(),
  logger = (line) => console.info(line),
} = {}) {
  const durationMs = Math.max(0, Math.round((now() - Number(trace?.startedAt || 0)) * 10) / 10);
  const event = {
    schemaVersion: 1,
    timestamp: timestamp(),
    requestId: normalizeRealmRequestId(trace?.requestId) || 'realm_invalid_trace',
    route: safeToken(trace?.route, 'realm.unknown'),
    operation: safeToken(trace?.operation, 'request'),
    method: safeToken(trace?.method, 'GET').toUpperCase(),
    status: Number.isInteger(status) ? status : 500,
    outcome: safeToken(outcome, 'error'),
    code: safeToken(code, 'realm_unknown'),
    durationMs,
  };
  try {
    logger(`[realm-observability] ${JSON.stringify(event)}`);
  } catch {
    // Telemetry must never make a business request fail.
  }
  return {
    event,
    headers: {
      'X-Realm-Request-Id': event.requestId,
      'X-Realm-Duration-Ms': String(durationMs),
      'X-Realm-Outcome': event.outcome,
      'Server-Timing': `realm;dur=${durationMs}`,
    },
  };
}

export function safeRealmException(trace, error, code = 'realm_internal_error', logger = (line) => console.error(line)) {
  const event = {
    schemaVersion: 1,
    requestId: normalizeRealmRequestId(trace?.requestId) || 'realm_invalid_trace',
    route: safeToken(trace?.route, 'realm.unknown'),
    errorName: safeToken(error?.name, 'Error'),
    code: safeToken(code, 'realm_internal_error'),
  };
  try {
    logger(`[realm-exception] ${JSON.stringify(event)}`);
  } catch {
    // Logging failure is non-fatal and must not expose request payloads.
  }
  return event;
}
