'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

const SYNC_INTERVAL_MS = 30_000;

export default function CeoRealtimeBridge() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    let active = true;
    let running = false;
    const sync = async () => {
      if (!active || running || document.visibilityState !== 'visible' || navigator.onLine === false) return;
      running = true;
      try {
        const response = await fetch('/api/ceo/v1/messaging/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 12 }),
          cache: 'no-store',
        });
        const detail = await response.json().catch(() => ({}));
        if (active && response.ok) window.dispatchEvent(new CustomEvent('repositoryrealms:ceo-sync', { detail }));
      } catch {
        // Per-source degradation is surfaced by Inbox/Cockpit; a background
        // refresh never interrupts the CEO's current workflow.
      } finally {
        running = false;
      }
    };
    const initial = setTimeout(sync, 7_000);
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    const onVisibility = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [status]);

  return null;
}
