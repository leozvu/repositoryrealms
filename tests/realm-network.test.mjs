import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealmDemoGuestProfile,
  createEnvelope,
  DEFAULT_PROFILE,
  isInVoiceRange,
  isRealmMessage,
  mergeRealmPresencePeople,
  normalizeProfile,
  REALM_CHANNEL,
  REALM_PROTOCOL_VERSION,
} from '../lib/realm-protocol.js';
import { normalizeRealmText, realmEmote, REALM_EMOTES } from '../lib/realm-social.js';
import {
  normalizePartyId,
  normalizePartyInvite,
  normalizePartyResponse,
  normalizePartyState,
  normalizePartyMedia,
} from '../lib/realm-party.js';
import { RealmPartyDirectory } from '../lib/realm-party-directory.js';
import {
  createBroadcastTransport,
  createGatewayTransport,
  resolveRealmGatewayUrl,
} from '../components/realm/realm-transports.js';
import { TokenVerifier } from 'livekit-server-sdk';
import { issueRealmSfuGrant, loadRealmSfuConfig, probeRealmSfu, realmLiveKitRoomName, realmSfuHealthUrl } from '../lib/realm-sfu-server.js';

test('normalizeProfile trims and validates identity fields', () => {
  assert.deepEqual(normalizeProfile({ name: '  Sơn Vũ  ', role: 'Questsmith', color: '#AABBCC' }), {
    name: 'Sơn Vũ',
    role: 'Questsmith',
    color: '#aabbcc',
    loadout: { title: null, seal: null, banner: null },
  });
  assert.equal(normalizeProfile({ name: '', role: '', color: 'red' }).name, DEFAULT_PROFILE.name);
  assert.equal(normalizeProfile({ color: 'red' }).color, DEFAULT_PROFILE.color);
});

test('demo guest identity is stable per browser profile and distinct across browsers', () => {
  assert.equal(createRealmDemoGuestProfile({}, 'browser-abc1234').name, 'Adventurer 1234');
  assert.equal(createRealmDemoGuestProfile({}, 'browser-abc1234').name, 'Adventurer 1234');
  assert.equal(createRealmDemoGuestProfile({}, 'browser-xyz9876').name, 'Adventurer 9876');
  assert.equal(createRealmDemoGuestProfile({ name: 'Sơn Vũ' }, 'browser-abc1234').name, 'Sơn Vũ');
});

test('gateway signaling is opt-in and never probes an unconfigured local service', () => {
  const previous = process.env.NEXT_PUBLIC_REALM_SIGNAL_URL;
  try {
    delete process.env.NEXT_PUBLIC_REALM_SIGNAL_URL;
    assert.equal(resolveRealmGatewayUrl(), '');
    process.env.NEXT_PUBLIC_REALM_SIGNAL_URL = '  wss://realm.example.test/realm  ';
    assert.equal(resolveRealmGatewayUrl(), 'wss://realm.example.test/realm');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_REALM_SIGNAL_URL;
    else process.env.NEXT_PUBLIC_REALM_SIGNAL_URL = previous;
  }
});

test('broadcast transport connects, forwards messages and closes cleanly', async () => {
  const previous = globalThis.BroadcastChannel;
  const received = [];
  let instance;
  class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.sent = [];
      this.closed = false;
      instance = this;
    }
    postMessage(message) { this.sent.push(message); }
    close() { this.closed = true; }
  }
  globalThis.BroadcastChannel = FakeBroadcastChannel;
  try {
    const transport = createBroadcastTransport({ onMessage: (message) => received.push(message) });
    assert.equal(transport.kind, 'broadcast');
    await transport.connect();
    assert.equal(instance.name, REALM_CHANNEL);
    assert.equal(transport.send({ type: 'presence' }), true);
    assert.deepEqual(instance.sent, [{ type: 'presence' }]);
    instance.onmessage({ data: { type: 'chat' } });
    assert.deepEqual(received, [{ type: 'chat' }]);
    transport.close();
    assert.equal(instance.closed, true);
    assert.equal(transport.send({ type: 'leave' }), false);
  } finally {
    if (previous === undefined) delete globalThis.BroadcastChannel;
    else globalThis.BroadcastChannel = previous;
  }
});

test('broadcast transport reports unsupported browsers', async () => {
  const previous = globalThis.BroadcastChannel;
  delete globalThis.BroadcastChannel;
  try {
    await assert.rejects(
      createBroadcastTransport({ onMessage() {} }).connect(),
      /BroadcastChannel unsupported/,
    );
  } finally {
    if (previous === undefined) delete globalThis.BroadcastChannel;
    else globalThis.BroadcastChannel = previous;
  }
});

test('gateway transport completes its token and socket lifecycle without leaking the grant', async () => {
  const previous = {
    fetch: globalThis.fetch,
    WebSocket: globalThis.WebSocket,
    window: globalThis.window,
  };
  const states = [];
  const messages = [];
  const tokenInfo = [];
  const sockets = [];
  class FakeWebSocket {
    static OPEN = 1;
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
      });
    }
    send(payload) { this.sent.push(payload); }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/realm-demo/token');
    assert.equal(options.method, 'POST');
    return {
      ok: true,
      json: async () => ({ token: 'signed-grant', realmId: 'realm-1', mapId: 'castle', iceServers: [] }),
    };
  };
  globalThis.WebSocket = FakeWebSocket;
  globalThis.window = { setTimeout, clearTimeout };
  try {
    const transport = createGatewayTransport({
      gatewayUrl: 'wss://realm.example.test/realm',
      sessionId: 'session-1',
      profile: DEFAULT_PROFILE,
      onMessage: (message) => messages.push(message),
      onState: (state) => states.push(state),
      onToken: (payload) => tokenInfo.push(payload),
      onOpen: () => states.push('opened'),
    });
    assert.equal(transport.kind, 'gateway');
    await transport.connect();
    assert.deepEqual(states, ['gateway-connecting', 'gateway-ready', 'opened']);
    assert.equal(tokenInfo[0].token, 'signed-grant');
    assert.deepEqual(sockets[0].protocols, ['realm-v2', 'signed-grant']);
    assert.equal(transport.send({ type: 'presence' }), true);
    assert.deepEqual(JSON.parse(sockets[0].sent[0]), { type: 'presence' });
    sockets[0].onmessage({ data: JSON.stringify({ type: 'chat' }) });
    sockets[0].onmessage({ data: 'not-json' });
    assert.deepEqual(messages, [{ type: 'chat' }]);
    transport.close();
    assert.equal(transport.send({ type: 'leave' }), false);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.WebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = previous.WebSocket;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
  }
});

test('gateway transport fails closed when the server cannot issue a token', async () => {
  const previous = { fetch: globalThis.fetch, window: globalThis.window };
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'Realm signaling chưa được cấu hình.' }) });
  globalThis.window = { clearTimeout };
  try {
    const transport = createGatewayTransport({
      gatewayUrl: 'wss://realm.example.test/realm',
      sessionId: 'session-1',
      profile: DEFAULT_PROFILE,
      onMessage() {},
      onState() {},
      onToken() {},
      onOpen() {},
    });
    await assert.rejects(transport.connect(), /Realm signaling chưa được cấu hình/);
    transport.close();
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
  }
});

test('normalizeProfile chỉ phát loadout hợp lệ qua presence protocol', () => {
  const profile = normalizeProfile({
    loadout: {
      title: { id: 'iron-scribe-title', name: 'Danh hiệu Iron Scribe', equipName: 'Iron Scribe', slot: 'title', slotLabel: 'Danh hiệu', icon: 'edit' },
      seal: { id: '../forged', name: 'Forged', equipName: 'Admin', slot: 'seal', icon: 'script' },
    },
  });
  assert.equal(profile.loadout.title.equipName, 'Iron Scribe');
  assert.equal(profile.loadout.title.icon, 'edit');
  assert.equal(profile.loadout.seal, null);
  assert.equal(profile.loadout.banner, null);
});

test('presence roster gộp nhiều tab của cùng một người và ưu tiên trạng thái live', () => {
  const staff = [
    { id: 'minh-static', name: 'Minh Quân', status: 'available' },
    { id: 'mai-static', name: 'Mai Anh', status: 'busy' },
  ];
  const remotes = [
    { id: 'minh-tab-1', name: 'Minh Quân', status: 'focus', isRemote: true, seenAt: 20 },
    { id: 'son-tab-old', name: 'Sơn Vũ', status: 'available', isRemote: true, seenAt: 10 },
    { id: 'son-tab-new', name: 'Sơn Vũ', status: 'busy', isRemote: true, seenAt: 30 },
  ];
  const people = mergeRealmPresencePeople({ staff, remotePlayers: remotes, selfProfile: { name: 'Adventurer Zero' } });
  assert.deepEqual(people.map((person) => person.id), ['son-tab-new', 'minh-tab-1', 'mai-static']);

  const withoutSelfDuplicate = mergeRealmPresencePeople({ staff, remotePlayers: remotes, selfProfile: { name: 'Minh Quân' } });
  assert.equal(withoutSelfDuplicate.some((person) => person.name === 'Minh Quân'), false);
  assert.deepEqual(withoutSelfDuplicate.map((person) => person.id), ['son-tab-new', 'mai-static']);
});

test('presence roster gộp gateway identity với ERP directory fallback theo tên', () => {
  const people = mergeRealmPresencePeople({
    remotePlayers: [{ id: 'session-1', name: 'Mai Anh', seenAt: 20, isRemote: true }],
    staff: [{ id: 'user-2', userId: 'user-2', name: 'Mai Anh', online: true }],
  });
  assert.equal(people.length, 1);
  assert.equal(people[0].id, 'session-1');
});

test('realm protocol only accepts the current typed envelope', () => {
  const message = createEnvelope('presence', 'player-1', { x: 1, y: 2 });
  assert.equal(message.version, REALM_PROTOCOL_VERSION);
  assert.equal(isRealmMessage(message), true);
  assert.equal(isRealmMessage({ ...message, version: 1 }), false);
  assert.equal(isRealmMessage({ ...message, type: 'unknown' }), false);
  assert.equal(isRealmMessage(createEnvelope('whisper', 'player-1', { text: 'bí mật' }, 'player-2')), true);
  assert.equal(isRealmMessage(createEnvelope('emote', 'player-1', { emoteId: 'wave' })), true);
});

test('realm social payloads use allowlisted emotes and bounded text', () => {
  assert.equal(REALM_EMOTES.length, 4);
  assert.equal(realmEmote(' WAVE ')?.mark, 'HI');
  assert.equal(realmEmote('not-allowed'), null);
  assert.equal(normalizeRealmText('  xin   chào  '), 'xin chào');
  assert.equal(normalizeRealmText('abcdef', 4), 'abcd');
});

test('party protocol validates ids, sender identity and explicit decisions', () => {
  assert.equal(normalizePartyId('party-12345678'), 'party-12345678');
  assert.equal(normalizePartyId('bad id'), '');
  assert.deepEqual(normalizePartyInvite({ partyId: 'party-12345678', hostProfile: { name: ' Host ' } }, 'host-1'), {
    partyId: 'party-12345678',
    hostId: 'host-1',
    hostProfile: { ...DEFAULT_PROFILE, name: 'Host' },
    memberCount: 1,
    maxMembers: 6,
    authoritative: false,
  });
  assert.equal(normalizePartyInvite({ partyId: 'bad' }, 'host-1'), null);
  assert.equal(normalizePartyResponse({ partyId: 'party-12345678', accepted: 'yes' }, 'member-1'), null);
  assert.equal(normalizePartyResponse({ partyId: 'party-12345678', accepted: true }, 'member-1')?.accepted, true);
  assert.equal(normalizePartyState({ party: null }), null);
  assert.equal(normalizePartyState({
    party: {
      id: 'party-12345678',
      hostId: 'host-1',
      members: [{ id: 'host-1', profile: { name: 'Host' }, joinedAt: 1 }],
      maxMembers: 6,
      authoritative: true,
    },
  })?.members.length, 1);
});

test('party media only accepts bounded LiveKit connection grants', () => {
  const media = normalizePartyMedia({
    provider: 'livekit',
    url: 'wss://media.example.test/',
    roomName: 'realm-12345678',
    token: 'x'.repeat(64),
    expiresAt: 123456,
  });
  assert.deepEqual(media, {
    provider: 'livekit',
    url: 'wss://media.example.test',
    roomName: 'realm-12345678',
    token: 'x'.repeat(64),
    expiresAt: 123456,
  });
  assert.equal(normalizePartyMedia({ ...media, url: 'https://media.example.test' }), null);
  assert.equal(normalizePartyMedia({ ...media, token: 'short' }), null);
});

test('gateway issues a short-lived room-scoped LiveKit grant only to party members', async () => {
  const config = loadRealmSfuConfig({
    REALM_SFU_PROVIDER: 'livekit',
    REALM_SFU_URL: 'ws://127.0.0.1:7880',
    REALM_SFU_API_KEY: 'test-key',
    REALM_SFU_API_SECRET: 'test-secret-that-is-long-enough',
    REALM_SFU_TOKEN_TTL_SECONDS: '180',
  });
  const party = {
    id: 'party-12345678',
    hostId: 'host-1',
    members: [{ id: 'host-1', profile: { name: 'Host' } }],
  };
  const grant = await issueRealmSfuGrant({ config, roomKey: 'realm:castle', party, targetId: 'host-1', now: 1000 });
  const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(grant.token);
  assert.equal(grant.roomName, realmLiveKitRoomName('realm:castle', party.id));
  assert.equal(grant.expiresAt, 181000);
  assert.equal(claims.sub, 'host-1');
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.room, grant.roomName);
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.canSubscribe, true);
  assert.equal(await issueRealmSfuGrant({ config, roomKey: 'realm:castle', party, targetId: 'outsider-1' }), null);
});

test('gateway probes LiveKit health without exposing credentials', async () => {
  assert.equal(realmSfuHealthUrl('wss://media.example.test/rtc?token=ignored'), 'https://media.example.test/');
  let requestedUrl = '';
  const config = loadRealmSfuConfig({
    REALM_SFU_PROVIDER: 'livekit',
    REALM_SFU_URL: 'ws://127.0.0.1:7880',
    REALM_SFU_API_KEY: 'test-key',
    REALM_SFU_API_SECRET: 'test-secret',
  });
  let tick = 100;
  const health = await probeRealmSfu(config, {
    now: () => ++tick,
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, text: async () => 'OK' };
    },
  });
  assert.equal(requestedUrl, 'http://127.0.0.1:7880/');
  assert.equal(health.status, 'up');
  assert.equal(Object.hasOwn(health, 'url'), false);
  assert.equal(Object.hasOwn(health, 'apiSecret'), false);
  assert.equal((await probeRealmSfu(config, { fetchImpl: async () => { throw new Error('offline'); } })).status, 'down');
});

test('gateway party directory owns multi-member room state and host controls', () => {
  let now = 100;
  const directory = new RealmPartyDirectory({
    maxPartySize: 4,
    now: () => ++now,
    makePartyId: () => 'party-12345678',
  });
  const roomKey = 'realm:castle';
  const invite = directory.invite({
    roomKey,
    senderId: 'host-1',
    senderProfile: { name: 'Host' },
    targetId: 'member-1',
    targetProfile: { name: 'Member One' },
  });
  assert.equal(directory.size, 1);
  assert.equal(invite.some((item) => item.targetId === 'member-1' && item.type === 'party-invite'), true);
  assert.equal(directory.sync(roomKey, 'host-1')[0].payload.party.pendingInvites.length, 1);

  directory.respond({
    roomKey,
    senderId: 'member-1',
    senderProfile: { name: 'Member One' },
    partyId: 'party-12345678',
    accepted: true,
  });
  assert.equal(directory.partyFor(roomKey, 'host-1').members.size, 2);
  assert.equal(directory.partyFor(roomKey, 'member-1').hostId, 'host-1');

  const denied = directory.invite({
    roomKey,
    senderId: 'member-1',
    senderProfile: { name: 'Member One' },
    targetId: 'member-2',
    targetProfile: { name: 'Member Two' },
  });
  assert.equal(denied[0].payload.code, 'host-only');

  directory.invite({
    roomKey,
    senderId: 'host-1',
    senderProfile: { name: 'Host' },
    targetId: 'member-2',
    targetProfile: { name: 'Member Two' },
  });
  directory.respond({
    roomKey,
    senderId: 'member-2',
    senderProfile: { name: 'Member Two' },
    partyId: 'party-12345678',
    accepted: true,
  });
  assert.equal(directory.partyFor(roomKey, 'host-1').members.size, 3);

  const kicked = directory.kick({ roomKey, senderId: 'host-1', targetId: 'member-1' });
  assert.equal(directory.partyFor(roomKey, 'member-1'), null);
  assert.equal(kicked.some((item) => item.targetId === 'member-1' && item.type === 'party-state' && item.payload.party === null), true);

  directory.disconnect(roomKey, 'host-1');
  assert.equal(directory.partyFor(roomKey, 'member-2').hostId, 'member-2');
  directory.end({ roomKey, senderId: 'member-2' });
  assert.equal(directory.size, 0);
  assert.equal(directory.partyFor(roomKey, 'member-2'), null);
});

test('party directory rejects invalid, offline, duplicate and expired invitations', () => {
  const roomKey = 'realm:castle';
  const invalidIdDirectory = new RealmPartyDirectory({ makePartyId: () => 'bad id' });
  assert.equal(invalidIdDirectory.invite({ roomKey, senderId: 'host-1', targetId: 'host-1' })[0].payload.code, 'invalid-target');
  assert.equal(invalidIdDirectory.invite({ roomKey, senderId: 'host-1', targetId: 'member-1', targetConnected: false })[0].payload.code, 'target-offline');
  assert.equal(invalidIdDirectory.invite({ roomKey, senderId: 'host-1', targetId: 'member-1' })[0].payload.code, 'party-id-failed');

  const directory = new RealmPartyDirectory({ maxPartySize: 3, makePartyId: () => 'party-12345678' });
  directory.invite({ roomKey, senderId: 'host-1', senderProfile: { name: 'Host' }, targetId: 'member-1', targetProfile: { name: 'Member' } });
  assert.equal(directory.sync(roomKey, 'member-1')[0].type, 'party-invite');
  assert.equal(directory.invite({ roomKey, senderId: 'host-1', targetId: 'member-1' })[0].payload.code, 'target-invited');
  assert.equal(directory.cancelInvite({ roomKey, senderId: 'outsider-1', partyId: 'party-12345678', targetId: 'member-1' })[0].payload.code, 'host-only');
  assert.equal(directory.cancelInvite({ roomKey, senderId: 'host-1', partyId: 'party-12345678', targetId: 'missing-1' })[0].payload.code, 'invite-expired');
  assert.equal(directory.cancelInvite({ roomKey, senderId: 'host-1', partyId: 'party-12345678', targetId: 'member-1' }).some((item) => item.payload.kind === 'invite-cancelled'), true);
  assert.deepEqual(directory.sync(roomKey, 'member-1'), []);

  directory.invite({ roomKey, senderId: 'host-1', senderProfile: { name: 'Host' }, targetId: 'member-1', targetProfile: { name: 'Member' } });
  const declined = directory.respond({ roomKey, senderId: 'member-1', senderProfile: { name: 'Member' }, partyId: 'party-12345678', accepted: false });
  assert.equal(declined.some((item) => item.payload.kind === 'invite-declined'), true);
  assert.equal(directory.respond({ roomKey, senderId: 'member-1', partyId: 'party-12345678', accepted: true })[0].payload.code, 'invite-expired');
});

test('party directory handles capacity races, member leave and pending cleanup', () => {
  const roomKey = 'realm:castle';
  const full = new RealmPartyDirectory({ maxPartySize: 2, makePartyId: () => 'party-12345678' });
  full.invite({ roomKey, senderId: 'host-1', senderProfile: { name: 'Host' }, targetId: 'member-1', targetProfile: { name: 'Member' } });
  full.partyFor(roomKey, 'host-1').members.set('race-member', { id: 'race-member', profile: normalizeProfile({ name: 'Race' }), joinedAt: 2 });
  assert.equal(full.respond({ roomKey, senderId: 'member-1', senderProfile: { name: 'Member' }, partyId: 'party-12345678', accepted: true }).some((item) => item.payload.code === 'party-full'), true);

  const directory = new RealmPartyDirectory({ maxPartySize: 4, makePartyId: () => 'party-abcdefgh' });
  directory.invite({ roomKey, senderId: 'host-1', senderProfile: { name: 'Host' }, targetId: 'member-1', targetProfile: { name: 'Member' } });
  directory.respond({ roomKey, senderId: 'member-1', senderProfile: { name: 'Member' }, partyId: 'party-abcdefgh', accepted: true });
  directory.invite({ roomKey, senderId: 'host-1', senderProfile: { name: 'Host' }, targetId: 'member-2', targetProfile: { name: 'Pending' } });
  assert.equal(directory.kick({ roomKey, senderId: 'member-1', targetId: 'host-1' })[0].payload.code, 'host-only');
  assert.equal(directory.kick({ roomKey, senderId: 'host-1', targetId: 'host-1' })[0].payload.code, 'invalid-member');
  assert.equal(directory.end({ roomKey, senderId: 'member-1' })[0].payload.code, 'host-only');
  const left = directory.leave({ roomKey, senderId: 'member-1' });
  assert.equal(left.some((item) => item.payload.kind === 'member-left' && item.payload.code === 'left'), true);
  assert.equal(directory.leave({ roomKey, senderId: 'member-1' })[0].payload.code, 'not-in-party');
  assert.deepEqual(directory.disconnect(roomKey, 'absent-1'), []);
  const ended = directory.end({ roomKey, senderId: 'host-1' });
  assert.equal(ended.some((item) => item.targetId === 'member-2' && item.payload.kind === 'invite-cancelled'), true);
  assert.equal(directory.size, 0);
});

test('voice range uses five tiles and lets matching private areas override distance', () => {
  assert.equal(isInVoiceRange({ x: 0, y: 0 }, { x: 3, y: 4, status: 'available' }), true);
  assert.equal(isInVoiceRange({ x: 0, y: 0 }, { x: 5.1, y: 0, status: 'available' }), false);
  assert.equal(isInVoiceRange({ x: 0, y: 0, zoneId: 'war' }, { x: 20, y: 20, zoneId: 'war', status: 'available' }), true);
  assert.equal(isInVoiceRange({ x: 0, y: 0 }, { x: 1, y: 1, status: 'dnd' }), false);
});
