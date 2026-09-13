import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcastTransport, createGatewayTransport } from '../components/realm/realm-transports.js';

test('2D and 3D local presence stay in separate channels while peers on the same map communicate', async () => {
  const original = globalThis.BroadcastChannel, channels = new Map();
  class Channel {
    constructor(name) { this.name = name; const group = channels.get(name) || new Set(); group.add(this); channels.set(name, group); }
    postMessage(data) { for (const peer of channels.get(this.name)) if (peer !== this) peer.onmessage?.({ data }); }
    close() { channels.get(this.name)?.delete(this); }
  }
  globalThis.BroadcastChannel = Channel;
  const old = [], self = [], peer = [];
  const transports = [createBroadcastTransport({ onMessage: message => old.push(message) }), createBroadcastTransport({ mapId: 'guildhall-3d', onMessage: message => self.push(message) }), createBroadcastTransport({ mapId: 'guildhall-3d', onMessage: message => peer.push(message) })];
  try {
    for (const transport of transports) await transport.connect();
    transports[1].send({ type: 'presence', x: 10 });
    assert.deepEqual(peer, [{ type: 'presence', x: 10 }]);
    assert.deepEqual(old, []); assert.deepEqual(self, []);
  } finally { transports.forEach(transport => transport.close()); globalThis.BroadcastChannel = original; }
});

test('a gateway cannot silently place the 3D office in a legacy map when its map is disabled', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'fixture', mapId: 'castle' }) });
  const transport = createGatewayTransport({ gatewayUrl: 'ws://localhost:3411/realm', sessionId: 'fixture', mapId: 'guildhall-3d', profile: {}, onMessage() {}, onState() {}, onToken() {}, onOpen() {} });
  try { await assert.rejects(transport.connect(), /map is not enabled/); }
  finally { transport.close(); globalThis.fetch = originalFetch; }
});
