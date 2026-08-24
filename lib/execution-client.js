const SAFE_SEGMENT = /[^a-zA-Z0-9_-]/g;

function safeSegment(value, fallback) {
  const normalized = String(value || '').trim().replace(SAFE_SEGMENT, '-');
  return normalized || fallback;
}

export function createExecutionIdempotencyKey(surface, action, randomUUID = () => globalThis.crypto.randomUUID()) {
  const key = `${safeSegment(surface, 'execution')}:${safeSegment(action, 'action')}:${safeSegment(randomUUID(), 'request')}`;
  return key.slice(0, 120);
}
