import assert from 'node:assert/strict';
import test from 'node:test';
import { cachedResilient, invalidate } from '../lib/cache.js';
import { buildRealmChaosReadiness, REALM_CHAOS_SCENARIOS } from '../lib/realm-chaos-readiness.js';
import { RealmDependencyError, withRealmDeadline } from '../lib/realm-resilience.js';
import { deliverRealmPilotNotifications } from '../lib/realm-pilot-operations.js';
import { fetchRealmWithTimeout, RealmClientTimeoutError } from '../components/realm/realm-fetch.js';
import { createGatewayTransport } from '../components/realm/realm-transports.js';
import { DEFAULT_PROFILE } from '../lib/realm-protocol.js';

test('Phase 20 database slow is bounded by a retryable read deadline', async () => {
  await assert.rejects(
    () => withRealmDeadline(() => new Promise(() => {}), {
      dependency: 'database',
      timeoutMs: 5,
      setTimer: (callback) => { queueMicrotask(callback); return 1; },
      clearTimer() {},
    }),
    (error) => error instanceof RealmDependencyError
      && error.status === 503
      && error.code === 'realm_database_timeout'
      && error.retryAfter === 5,
  );
});
test('Phase 20 API timeout aborts once and leaves mutation retry to the operator', async () => {
  let calls = 0;
  const fetchImpl = async (_url, { signal }) => {
    calls += 1;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  await assert.rejects(
    () => fetchRealmWithTimeout('/realm', { method: 'POST' }, { timeoutMs: 5, fetchImpl }),
    (error) => error instanceof RealmClientTimeoutError && error.code === 'realm_api_timeout',
  );
  assert.equal(calls, 1);
});

test('Phase 20 stale cache serves last-known-good only inside the explicit error window', async () => {
  const key = 'realm-chaos-stale-cache';
  invalidate(key);
  let timestamp = 0;
  const states = [];
  assert.deepEqual(await cachedResilient(key, 10, 20, async () => ({ total: 7 }), {
    now: () => timestamp,
    onState: (state) => states.push(state.source),
  }), { total: 7 });
  timestamp = 15;
  assert.deepEqual(await cachedResilient(key, 10, 20, async () => { throw new Error('database slow'); }, {
    now: () => timestamp,
    onState: (state) => states.push(state.source),
  }), { total: 7 });
  timestamp = 31;
  await assert.rejects(() => cachedResilient(key, 10, 20, async () => { throw new Error('database down'); }, { now: () => timestamp }), /database down/);
  assert.deepEqual(states, ['live', 'stale']);
  invalidate(key);
});

test('Phase 20 notification failure is best-effort and returns a degraded receipt', async () => {
  const delivery = await deliverRealmPilotNotifications({
    notification: { createMany: async () => { throw new Error('provider down'); } },
  }, [{ userId: 'director-1', text: 'Wave changed', route: '/settings' }]);
  assert.deepEqual(delivery, {
    state: 'degraded', attempted: 1, delivered: 0, code: 'realm_notification_delivery_failed',
  });
});

test('Phase 20 partial rollout stays protected while ERP fallback is healthy', () => {
  const readiness = buildRealmChaosReadiness({
    metrics: { eligibleUsers: 2, cohort: { available: 9 } },
    policy: { mode: 'pilot' },
    readiness: { gates: [{ id: 'erp-fallback', passed: true }] },
    approvalTimeouts: 1,
    notificationDelivery: { state: 'degraded', attempted: 2 },
  });
  assert.equal(REALM_CHAOS_SCENARIOS.length, 7);
  assert.equal(readiness.posture, 'degraded');
  assert.equal(readiness.scenarios.find((row) => row.id === 'partial-rollout').state, 'protected');
  assert.match(readiness.scenarios.find((row) => row.id === 'partial-rollout').liveDetail, /2 Realm · 7 ERP fallback/);
  assert.equal(readiness.scenarios.find((row) => row.id === 'approval-timeout').state, 'contained');
  assert.equal(readiness.scenarios.find((row) => row.id === 'notification-failed').state, 'contained');
  assert.equal(readiness.rules.automaticWriteRetry, false);
  assert.equal(readiness.privacy.rosterIncluded, false);
});

test('Phase 20 websocket loss exhausts a bounded reconnect budget and requests local fallback', async () => {
  const previous = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, window: globalThis.window };
  const states = [];
  const sockets = [];
  let exhausted = 0;
  class FakeWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      sockets.push(this);
      queueMicrotask(() => { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); });
    }
    send() {}
    close() { this.readyState = 3; this.onclose?.(); }
  }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'grant', realmId: 'realm', mapId: 'castle' }) });
  globalThis.WebSocket = FakeWebSocket;
  globalThis.window = { setTimeout, clearTimeout };
  try {
    const transport = createGatewayTransport({
      gatewayUrl: 'wss://realm.example.test', sessionId: 'session-1', profile: DEFAULT_PROFILE,
      onMessage() {}, onState: (state) => states.push(state), onToken() {}, onOpen() {},
      maxReconnectAttempts: 0, onExhausted: () => { exhausted += 1; },
    });
    await transport.connect();
    sockets[0].onclose();
    assert.equal(exhausted, 1);
    assert.equal(states.at(-1), 'gateway-degraded');
    transport.close();
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.WebSocket === undefined) delete globalThis.WebSocket; else globalThis.WebSocket = previous.WebSocket;
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
  }
});
