import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { PARTY_CLIENT_MESSAGE_TYPES, PARTY_SERVER_MESSAGE_TYPES, REALM_GATEWAY_ID } from '../lib/realm-party.js';
import { RealmPartyDirectory } from '../lib/realm-party-directory.js';
import { isRealmMessage, normalizeProfile } from '../lib/realm-protocol.js';
import { realmRoomKey, verifyRealmToken } from '../lib/realm-token.js';
import { issueRealmSfuGrant, loadRealmSfuConfig, probeRealmSfu } from '../lib/realm-sfu-server.js';

const port = Number(process.env.REALM_SIGNAL_PORT || 3301);
const host = process.env.REALM_SIGNAL_HOST || '0.0.0.0';
const secret = process.env.REALM_SIGNAL_SECRET;
const maxRoomSize = Math.max(2, Math.min(Number(process.env.REALM_MAX_ROOM_SIZE) || 50, 200));
const maxPartySize = Math.max(2, Math.min(Number(process.env.REALM_MAX_PARTY_SIZE) || 6, 12));
const partyReconnectGraceMs = Math.max(3000, Math.min(Number(process.env.REALM_PARTY_RECONNECT_GRACE_MS) || 12_000, 60_000));
const sfuConfig = loadRealmSfuConfig(process.env);
const allowedOrigins = new Set((process.env.REALM_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean));
const rooms = new Map();
const partyDirectory = new RealmPartyDirectory({ maxPartySize });
const partyDisconnectTimers = new Map();
const partyMediaRefreshMs = sfuConfig ? Math.max(30, Math.floor(sfuConfig.ttlSeconds / 2)) * 1000 : 0;
let sfuHealth = { status: sfuConfig ? 'checking' : 'disabled', checkedAt: 0, latencyMs: 0 };
let sfuHealthProbeRunning = false;

if (!secret || secret.length < 24) {
  throw new Error('Set REALM_SIGNAL_SECRET to at least 24 characters before starting the gateway.');
}

function writeUpgradeError(socket, status, message) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);
  socket.destroy();
}

function send(socket, value) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function broadcast(roomKey, message, exceptId) {
  const room = rooms.get(roomKey);
  if (!room) return;
  for (const [clientId, socket] of room) {
    if (clientId !== exceptId) send(socket, message);
  }
}

function partyTimerKey(roomKey, clientId) {
  return `${roomKey}\u0000${clientId}`;
}

async function partyEnvelope(roomKey, deliveryItem) {
  let payload = deliveryItem.payload;
  if (sfuConfig && deliveryItem.type === 'party-state' && payload?.party) {
    const media = await issueRealmSfuGrant({
      config: sfuConfig,
      roomKey,
      party: payload.party,
      targetId: deliveryItem.targetId,
    });
    if (media) payload = { ...payload, party: { ...payload.party, media } };
  }
  return {
    version: 2,
    type: deliveryItem.type,
    senderId: REALM_GATEWAY_ID,
    targetId: deliveryItem.targetId,
    payload,
    sentAt: Date.now(),
  };
}

async function deliverParty(roomKey, deliveries) {
  const room = rooms.get(roomKey);
  if (!room) return;
  for (const item of deliveries) {
    const target = room.get(item.targetId);
    if (target) send(target, await partyEnvelope(roomKey, item));
  }
}

function queuePartyDelivery(roomKey, deliveries) {
  void deliverParty(roomKey, deliveries).catch((error) => {
    process.stderr.write(`Party delivery failed: ${error?.message || 'unknown error'}\n`);
  });
}

async function refreshSfuHealth() {
  if (!sfuConfig || sfuHealthProbeRunning) return;
  sfuHealthProbeRunning = true;
  try {
    sfuHealth = await probeRealmSfu(sfuConfig);
  } finally {
    sfuHealthProbeRunning = false;
  }
}

function handlePartyMessage(socket, message, room) {
  const context = {
    roomKey: socket.realmRoom,
    senderId: socket.realmClaims.sub,
    senderProfile: socket.realmProfile,
    partyId: message.payload?.partyId,
    targetId: message.targetId || message.payload?.targetId,
  };
  let deliveries = [];
  if (message.type === 'party-invite') {
    const target = room.get(message.targetId);
    deliveries = partyDirectory.invite({
      ...context,
      targetConnected: Boolean(target),
      targetProfile: target?.realmProfile || message.payload?.targetProfile,
    });
  } else if (message.type === 'party-response') {
    deliveries = partyDirectory.respond({ ...context, accepted: message.payload?.accepted === true });
  } else if (message.type === 'party-cancel-invite') {
    deliveries = partyDirectory.cancelInvite(context);
  } else if (message.type === 'party-leave') {
    deliveries = partyDirectory.leave(context);
  } else if (message.type === 'party-end') {
    deliveries = partyDirectory.end(context);
  } else if (message.type === 'party-kick') {
    deliveries = partyDirectory.kick(context);
  }
  queuePartyDelivery(socket.realmRoom, deliveries);
}

function leaveRoom(socket) {
  const room = rooms.get(socket.realmRoom);
  if (!room || !socket.realmClaims) return;
  if (room.get(socket.realmClaims.sub) !== socket) return;
  room.delete(socket.realmClaims.sub);
  broadcast(socket.realmRoom, {
    version: 2,
    type: 'leave',
    senderId: socket.realmClaims.sub,
    payload: {},
    sentAt: Date.now(),
  });
  const clientId = socket.realmClaims.sub;
  if (partyDirectory.partyFor(socket.realmRoom, clientId) || partyDirectory.invitationFor(socket.realmRoom, clientId)) {
    const timerKey = partyTimerKey(socket.realmRoom, clientId);
    clearTimeout(partyDisconnectTimers.get(timerKey));
    partyDisconnectTimers.set(timerKey, setTimeout(() => {
      partyDisconnectTimers.delete(timerKey);
      queuePartyDelivery(socket.realmRoom, partyDirectory.disconnect(socket.realmRoom, clientId));
    }, partyReconnectGraceMs));
  }
  if (!room.size) rooms.delete(socket.realmRoom);
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    const clients = [...rooms.values()].reduce((total, room) => total + room.size, 0);
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      clients,
      parties: partyDirectory.size,
      maxPartySize,
      mediaTopology: sfuConfig ? 'sfu-livekit' : 'p2p-mesh',
      mediaServer: sfuHealth,
      uptime: Math.floor(process.uptime()),
    }));
    return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 32 * 1024,
  perMessageDeflate: false,
  handleProtocols: (protocols) => protocols.has('realm-v2') ? 'realm-v2' : false,
});

server.on('upgrade', (request, socket, head) => {
  try {
    const origin = request.headers.origin || '';
    if (allowedOrigins.size && !allowedOrigins.has(origin)) return writeUpgradeError(socket, '403 Forbidden', 'Origin not allowed');
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/realm') return writeUpgradeError(socket, '404 Not Found', 'Not found');
    const protocols = (request.headers['sec-websocket-protocol'] || '').split(',').map((item) => item.trim());
    const token = protocols.find((protocol) => protocol !== 'realm-v2');
    if (!protocols.includes('realm-v2') || !token) return writeUpgradeError(socket, '401 Unauthorized', 'Missing Realm protocol token');
    const claims = verifyRealmToken(token, secret);
    const roomKey = realmRoomKey(claims);
    const room = rooms.get(roomKey) || new Map();
    if (room.size >= maxRoomSize && !room.has(claims.sub)) return writeUpgradeError(socket, '429 Too Many Requests', 'Realm is full');

    wss.handleUpgrade(request, socket, head, (websocket) => {
      websocket.realmClaims = claims;
      websocket.realmRoom = roomKey;
      wss.emit('connection', websocket, request);
    });
  } catch {
    writeUpgradeError(socket, '401 Unauthorized', 'Invalid or expired Realm token');
  }
});

wss.on('connection', (socket) => {
  const { sub, realmId, mapId } = socket.realmClaims;
  const room = rooms.get(socket.realmRoom) || new Map();
  const previous = room.get(sub);
  if (previous && previous !== socket) previous.close(4001, 'Session replaced');
  room.set(sub, socket);
  rooms.set(socket.realmRoom, room);
  socket.realmProfile = normalizeProfile({ name: socket.realmClaims.name });
  const reconnectKey = partyTimerKey(socket.realmRoom, sub);
  clearTimeout(partyDisconnectTimers.get(reconnectKey));
  partyDisconnectTimers.delete(reconnectKey);
  socket.isAlive = true;
  socket.rateWindow = { startedAt: Date.now(), messages: 0 };

  send(socket, { type: 'gateway-ready', realmId, mapId, peers: room.size - 1, partyAuthority: true, maxPartySize, mediaTopology: sfuConfig ? 'sfu-livekit' : 'p2p-mesh', mediaServerStatus: sfuHealth.status });
  queuePartyDelivery(socket.realmRoom, partyDirectory.sync(socket.realmRoom, sub));

  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', (raw, isBinary) => {
    if (isBinary || raw.length > 32 * 1024) return socket.close(1009, 'Message too large');
    const now = Date.now();
    if (now - socket.rateWindow.startedAt > 10_000) socket.rateWindow = { startedAt: now, messages: 0 };
    socket.rateWindow.messages += 1;
    if (socket.rateWindow.messages > 120) return socket.close(1008, 'Rate limit exceeded');

    let message;
    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      return socket.close(1007, 'Invalid JSON');
    }
    if (!isRealmMessage(message) || message.senderId !== sub) return socket.close(1008, 'Invalid Realm message');
    if (PARTY_SERVER_MESSAGE_TYPES.includes(message.type)) return socket.close(1008, 'Server-only Realm message');
    if (message.type === 'presence') {
      socket.realmProfile = normalizeProfile(message.payload?.profile);
      message = {
        ...message,
        payload: {
          ...message.payload,
          ...(socket.realmClaims.userId ? { identityId: socket.realmClaims.userId } : {}),
        },
      };
    }
    if (PARTY_CLIENT_MESSAGE_TYPES.includes(message.type)) {
      handlePartyMessage(socket, message, room);
      return;
    }
    if (message.targetId) {
      const target = room.get(message.targetId);
      if (target) send(target, message);
    } else {
      broadcast(socket.realmRoom, message, sub);
    }
  });
  socket.on('close', () => leaveRoom(socket));
  socket.on('error', () => {});
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 20_000);

const partyMediaRefresh = partyMediaRefreshMs ? setInterval(() => {
  for (const [roomKey, room] of rooms) {
    for (const clientId of room.keys()) {
      if (partyDirectory.partyFor(roomKey, clientId)) {
        queuePartyDelivery(roomKey, partyDirectory.sync(roomKey, clientId));
      }
    }
  }
}, partyMediaRefreshMs) : null;
partyMediaRefresh?.unref();

void refreshSfuHealth();
const sfuHealthRefresh = sfuConfig ? setInterval(() => { void refreshSfuHealth(); }, 10_000) : null;
sfuHealthRefresh?.unref();

server.on('close', () => {
  clearInterval(heartbeat);
  if (partyMediaRefresh) clearInterval(partyMediaRefresh);
  if (sfuHealthRefresh) clearInterval(sfuHealthRefresh);
});
server.listen(port, host, () => {
  process.stdout.write(`CRMegoric Realm gateway listening on ws://${host}:${port}/realm\n`);
  process.stdout.write(`Party media topology: ${sfuConfig ? 'LiveKit SFU' : 'P2P mesh fallback'}\n`);
});

function shutdown() {
  for (const timer of partyDisconnectTimers.values()) clearTimeout(timer);
  partyDisconnectTimers.clear();
  for (const socket of wss.clients) socket.close(1001, 'Gateway shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
