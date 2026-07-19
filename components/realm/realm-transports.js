'use client';

import { REALM_CHANNEL } from '../../lib/realm-protocol.js';

export function resolveRealmGatewayUrl() {
  const configured = process.env.NEXT_PUBLIC_REALM_SIGNAL_URL?.trim();
  return configured || '';
}

export function createBroadcastTransport({ onMessage }) {
  let channel;
  return {
    kind: 'broadcast',
    async connect() {
      if (typeof BroadcastChannel === 'undefined') throw new Error('BroadcastChannel unsupported');
      channel = new BroadcastChannel(REALM_CHANNEL);
      channel.onmessage = (event) => onMessage(event.data);
    },
    send(message) {
      if (!channel) return false;
      channel.postMessage(message);
      return true;
    },
    close() {
      channel?.close();
      channel = null;
    },
  };
}

export function createGatewayTransport({
  gatewayUrl,
  sessionId,
  profile,
  mapId = 'castle',
  onMessage,
  onState,
  onToken,
  onOpen,
}) {
  let socket;
  let stopped = false;
  let reconnectTimer;
  let reconnectAttempt = 0;

  async function fetchToken() {
    const response = await fetch('/api/realm-demo/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, profile, mapId }),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token) throw new Error(payload.error || 'Realm token unavailable');
    onToken(payload);
    return payload.token;
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectAttempt += 1;
    const delay = Math.min(8000, 600 * (2 ** Math.min(reconnectAttempt, 4))) + Math.round(Math.random() * 250);
    onState('gateway-reconnecting');
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      openSocket(false).catch(scheduleReconnect);
    }, delay);
  }

  async function openSocket(initial) {
    onState(initial ? 'gateway-connecting' : 'gateway-reconnecting');
    const token = await fetchToken();
    if (stopped) throw new Error('Gateway transport stopped');
    const url = new URL(gatewayUrl);

    await new Promise((resolve, reject) => {
      let opened = false;
      const candidate = new WebSocket(url.toString(), ['realm-v2', token]);
      socket = candidate;
      const timeout = window.setTimeout(() => {
        if (!opened) {
          candidate.close();
          reject(new Error('Gateway connection timed out'));
        }
      }, 3500);

      candidate.onopen = () => {
        opened = true;
        window.clearTimeout(timeout);
        reconnectAttempt = 0;
        onState('gateway-ready');
        onOpen();
        resolve();
      };
      candidate.onmessage = (event) => {
        try { onMessage(JSON.parse(event.data)); } catch { /* ignore malformed gateway frames */ }
      };
      candidate.onerror = () => {
        if (!opened) {
          window.clearTimeout(timeout);
          reject(new Error('Gateway connection failed'));
        }
      };
      candidate.onclose = () => {
        window.clearTimeout(timeout);
        if (!opened) reject(new Error('Gateway rejected the connection'));
        else scheduleReconnect();
      };
    });
  }

  return {
    kind: 'gateway',
    connect: () => openSocket(true),
    send(message) {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    close() {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      socket?.close(1000, 'Realm client leaving');
      socket = null;
    },
  };
}
