'use client';

import { useCallback, useEffect, useState } from 'react';

export function useCollaborationDirectory({ enabled = true, refreshMs = 15_000 } = {}) {
  const [people, setPeople] = useState([]);
  const [state, setState] = useState(enabled ? 'loading' : 'disabled');
  const [generatedAt, setGeneratedAt] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch('/api/collaboration/presence', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.people)) throw new Error(payload.error || 'Directory unavailable');
      setPeople(payload.people);
      setGeneratedAt(payload.generatedAt || null);
      setState('ready');
    } catch {
      setState((current) => current === 'ready' ? 'stale' : 'unavailable');
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPeople([]);
      setState('disabled');
      return undefined;
    }
    load();
    const timer = window.setInterval(load, refreshMs);
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [enabled, load, refreshMs]);

  return { people, state, generatedAt, refresh: load };
}
