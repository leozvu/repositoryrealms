'use client';

export const REALM_CLIENT_TIMEOUT_MS = 8_000;

export class RealmClientTimeoutError extends Error {
  constructor(message = 'Realm phản hồi quá lâu. Dữ liệu gần nhất vẫn được giữ; hãy thử lại.') {
    super(message);
    this.name = 'RealmClientTimeoutError';
    this.code = 'realm_api_timeout';
  }
}
export async function fetchRealmWithTimeout(url, options = {}, {
  timeoutMs = REALM_CLIENT_TIMEOUT_MS,
  fetchImpl = fetch,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const controller = new AbortController();
  const upstreamSignal = options.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abortFromUpstream();
  else upstreamSignal?.addEventListener?.('abort', abortFromUpstream, { once: true });
  const timer = setTimer(() => controller.abort('realm-api-timeout'), Math.max(1, Number(timeoutMs) || REALM_CLIENT_TIMEOUT_MS));
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !upstreamSignal?.aborted) throw new RealmClientTimeoutError();
    throw error;
  } finally {
    clearTimer(timer);
    upstreamSignal?.removeEventListener?.('abort', abortFromUpstream);
  }
}
