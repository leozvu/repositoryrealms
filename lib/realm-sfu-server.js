import { createHash } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_ROOM_NAME = /^[a-z0-9-]{8,64}$/i;

function clamp(value, min, max) {
  return Math.max(min, Math.min(Number(value) || min, max));
}

function normalizeLiveKitUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normalizeHealthUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function realmSfuHealthUrl(value) {
  const socketUrl = normalizeLiveKitUrl(value);
  if (!socketUrl) return '';
  const url = new URL(socketUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.href;
}

export function loadRealmSfuConfig(env = process.env) {
  const provider = String(env.REALM_SFU_PROVIDER || '').trim().toLowerCase();
  if (!provider) return null;
  if (provider !== 'livekit') throw new Error(`Unsupported REALM_SFU_PROVIDER: ${provider}`);

  const url = normalizeLiveKitUrl(env.REALM_SFU_URL);
  const apiKey = String(env.REALM_SFU_API_KEY || '').trim();
  const apiSecret = String(env.REALM_SFU_API_SECRET || '').trim();
  if (!url || !apiKey || !apiSecret) {
    throw new Error('LiveKit SFU requires REALM_SFU_URL, REALM_SFU_API_KEY and REALM_SFU_API_SECRET.');
  }

  return {
    provider: 'livekit',
    url,
    apiKey,
    apiSecret,
    ttlSeconds: Math.round(clamp(env.REALM_SFU_TOKEN_TTL_SECONDS || 300, 60, 3600)),
    healthUrl: normalizeHealthUrl(env.REALM_SFU_HEALTH_URL) || realmSfuHealthUrl(url),
  };
}

export async function probeRealmSfu(config, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 1500,
  now = () => Date.now(),
} = {}) {
  if (!config) return { status: 'disabled', checkedAt: 0, latencyMs: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, Math.min(timeoutMs, 5000)));
  const startedAt = now();
  try {
    const response = await fetchImpl(config.healthUrl, {
      method: 'GET',
      headers: { Accept: 'text/plain' },
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      status: response.ok && body.trim().toUpperCase() === 'OK' ? 'up' : 'down',
      checkedAt: now(),
      latencyMs: Math.max(0, now() - startedAt),
    };
  } catch {
    return { status: 'down', checkedAt: now(), latencyMs: Math.max(0, now() - startedAt) };
  } finally {
    clearTimeout(timer);
  }
}

export function realmLiveKitRoomName(roomKey, partyId) {
  const digest = createHash('sha256').update(`${roomKey}\u0000${partyId}`).digest('hex').slice(0, 32);
  const roomName = `realm-${digest}`;
  if (!LIVEKIT_ROOM_NAME.test(roomName)) throw new Error('Could not derive a valid LiveKit room name.');
  return roomName;
}

export async function issueRealmSfuGrant({ config, roomKey, party, targetId, now = Date.now() }) {
  if (!config || config.provider !== 'livekit' || !party || !targetId) return null;
  const member = party.members?.find((item) => item.id === targetId);
  if (!member) return null;

  const roomName = realmLiveKitRoomName(roomKey, party.id);
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: targetId,
    name: member.profile?.name || targetId,
    ttl: config.ttlSeconds,
    attributes: {
      realmPartyId: party.id,
      realmRole: party.hostId === targetId ? 'host' : 'member',
    },
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return {
    provider: 'livekit',
    url: config.url,
    roomName,
    token: await token.toJwt(),
    expiresAt: now + (config.ttlSeconds * 1000),
  };
}
