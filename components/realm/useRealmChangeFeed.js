'use client';

import { useEffect, useRef, useState } from 'react';

const FALLBACK_POLL_MS = 5_000;
const MAX_RETRY_MS = 30_000;
export const REALM_CHANGE_BROWSER_EVENT = 'crmegoric:realm-change';

export function useRealmChangeFeed({ enabled = false, onChanges } = {}) {
  const callbackRef = useRef(onChanges);
  const [state, setState] = useState(enabled ? 'connecting' : 'disabled');
  const [lastEventAt, setLastEventAt] = useState(null);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => { callbackRef.current = onChanges; }, [onChanges]);

  useEffect(() => {
    if (!enabled) {
      setState('disabled');
      return undefined;
    }
    let active = true;
    let cursor = null;
    let timer = null;
    let controller = null;
    let retryMs = FALLBACK_POLL_MS;

    const schedule = (delay) => {
      if (!active) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      if (!active) return;
      if (document.hidden) {
        schedule(FALLBACK_POLL_MS);
        return;
      }
      controller?.abort();
      controller = new AbortController();
      try {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const response = await fetch(`/api/realm-demo/changes${query}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.source !== 'erp' || !payload?.cursor) {
          throw new Error(payload?.error || 'Realm change-feed không khả dụng.');
        }
        cursor = payload.cursor;
        setState('ready');
        retryMs = FALLBACK_POLL_MS;
        if (payload.changed) {
          setLastEventAt(payload.generatedAt || new Date().toISOString());
          setEventCount((current) => current + Number(payload.eventCount || 0));
          window.dispatchEvent(new CustomEvent(REALM_CHANGE_BROWSER_EVENT, { detail: payload }));
          await callbackRef.current?.(payload);
        }
        schedule(payload.hasMore ? 0 : Number(payload.pollAfterMs) || FALLBACK_POLL_MS);
      } catch (error) {
        if (!active || error?.name === 'AbortError') return;
        setState((current) => current === 'ready' ? 'stale' : 'unavailable');
        retryMs = Math.min(MAX_RETRY_MS, retryMs * 2);
        schedule(retryMs);
      }
    };

    const resume = () => {
      if (document.hidden) return;
      window.clearTimeout(timer);
      poll();
    };
    setState('connecting');
    poll();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [enabled]);

  return { state, lastEventAt, eventCount };
}
